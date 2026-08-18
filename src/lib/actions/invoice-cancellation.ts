"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma, runInTenantTransaction } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import { canCancelInvoice } from "@/lib/invoice-cancellation-rules";

/**
 * Voids a completed sale and undoes everything it did.
 *
 * Only owners and pharmacists — a counter staffer who mis-rang a bill asks
 * one of them, the same authority boundary as the discount cap. Restricted to
 * same-day invoices with no e-invoice IRN (see invoice-cancellation-rules.ts
 * for why each boundary exists).
 *
 * The invoice row is kept and marked cancelled rather than deleted: the
 * invoice-number series must have no gaps for an auditor, and a customer
 * holding a printed receipt needs the number to still resolve to something.
 * Everything downstream already filters on `status: "completed"`, so a
 * cancelled sale drops out of dashboards, registers, GST exports and the
 * discount report without any of them needing to change.
 */

const cancelSchema = z.object({
  // Required, and long enough to be a sentence rather than a shrug. This is
  // the only record of *why* stock moved back and a tax invoice stopped
  // counting; "mistake" tells a future auditor nothing.
  reason: z.string().trim().min(5, "Give a short reason (at least 5 characters)").max(300),
});

export type CancelInvoiceResult =
  | { ok: true; invoiceNo: string }
  | { ok: false; error: string };

export async function cancelInvoice(
  invoiceId: string,
  input: { reason: string }
): Promise<CancelInvoiceResult> {
  const session = await requireRole(["owner", "pharmacist"]);
  const tenantId = session.user.tenantId;

  const parsed = cancelSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const invoice = await prisma.salesInvoice.findFirst({
    where: { id: invoiceId, tenantId },
    include: {
      items: true,
      narcoticRegisterEntries: { where: { reversalOfId: null }, include: { reversedBy: true } },
      insuranceClaim: true,
      discounts: { where: { couponId: { not: null } }, select: { couponId: true } },
    },
  });
  if (!invoice) return { ok: false, error: "Invoice not found" };

  const eligibility = canCancelInvoice(invoice, new Date());
  if (!eligibility.allowed) {
    return { ok: false, error: eligibility.message! };
  }

  const now = new Date();

  await runInTenantTransaction(async (tx) => {
    // Re-read inside the transaction and only move if still completed. Two
    // managers hitting Cancel at once would otherwise each restore stock,
    // handing the shop twice the units it sold.
    const claimed = await tx.salesInvoice.updateMany({
      where: { id: invoice.id, tenantId, status: "completed" },
      data: {
        status: "cancelled",
        cancelledAt: now,
        cancelledByUserId: session.user.id,
        cancellationReason: parsed.data.reason,
      },
    });
    if (claimed.count === 0) {
      throw new Error("This invoice was cancelled by someone else just now.");
    }

    // Stock goes back to the exact batch it left, not to the item's current
    // FEFO pick — expiry dates differ between batches, and returning units to
    // the wrong one silently rewrites what is on the shelf.
    for (const line of invoice.items) {
      await tx.batch.update({
        where: { id: line.batchId },
        data: { currentQty: { increment: line.qty } },
      });
    }

    // The narcotic register is insert-only by regulation, so a cancelled
    // Schedule X dispense is corrected with a reversal row, never a delete.
    for (const entry of invoice.narcoticRegisterEntries) {
      if (entry.reversedBy) continue;
      await tx.narcoticRegisterEntry.create({
        data: {
          tenantId,
          branchId: entry.branchId,
          invoiceId: entry.invoiceId,
          itemId: entry.itemId,
          batchId: entry.batchId,
          qty: entry.qty,
          doctorId: entry.doctorId,
          patientName: entry.patientName,
          dispensedByUserId: session.user.id,
          reversalOfId: entry.id,
        },
      });
    }

    // A coupon consumed by a cancelled sale becomes usable again — otherwise
    // a mis-rung bill silently burns a customer's single-use code.
    const couponIds = [...new Set(invoice.discounts.map((d) => d.couponId!))];
    for (const couponId of couponIds) {
      await tx.coupon.updateMany({
        where: { id: couponId, tenantId, usageCount: { gt: 0 } },
        data: { usageCount: { decrement: 1 } },
      });
    }

    if (invoice.insuranceClaim) {
      // Nothing is owed by the insurer for a sale that did not happen. The
      // claim row is kept for the same reason the invoice is.
      await tx.insuranceClaim.update({
        where: { id: invoice.insuranceClaim.id },
        data: {
          status: "rejected",
          rejectionReason: `Invoice ${invoice.invoiceNo} cancelled: ${parsed.data.reason}`,
        },
      });
    }

    if (invoice.customerId) {
      const total = Number(invoice.total);

      // A credit sale put a positive row on the customer's ledger. Undo it
      // with a negative row rather than deleting: the statement should show
      // both the charge and its reversal, so a customer who already saw the
      // charge is not left wondering where it went.
      if (invoice.paymentMode === "credit") {
        await tx.customerLedgerEntry.create({
          data: {
            tenantId,
            customerId: invoice.customerId,
            type: "sale_reversal",
            amount: -total,
            referenceId: invoice.id,
            referenceType: "SalesInvoice",
            note: `Cancelled: ${parsed.data.reason}`,
          },
        });
      }

      const updated = await tx.customer.update({
        where: { id: invoice.customerId },
        data: { cumulativeSpend: { decrement: total } },
      });

      // Lifetime spend drove their loyalty tier, so rolling it back can drop
      // them a tier. Recomputed with the same rule the sale used rather than
      // simply reversing the earlier promotion, which would be wrong whenever
      // other sales have landed since.
      const tiers = await tx.loyaltyTier.findMany({
        where: { tenantId },
        orderBy: { minCumulativeSpend: "desc" },
      });
      const newSpend = Number(updated.cumulativeSpend);
      const newTier = tiers.find((t) => Number(t.minCumulativeSpend) <= newSpend) ?? null;
      if ((newTier?.id ?? null) !== updated.loyaltyTierId) {
        await tx.customer.update({
          where: { id: invoice.customerId },
          data: { loyaltyTierId: newTier?.id ?? null },
        });
      }
    }
  });

  await writeAuditLog({
    tenantId,
    userId: session.user.id,
    action: "sale.cancel",
    entity: "SalesInvoice",
    entityId: invoice.id,
    before: {
      invoiceNo: invoice.invoiceNo,
      total: Number(invoice.total),
      paymentMode: invoice.paymentMode,
      status: "completed",
    },
    after: {
      status: "cancelled",
      reason: parsed.data.reason,
      // What was actually put back, so the stock movement is reconstructable
      // from the log without re-reading the invoice lines.
      restockedLines: invoice.items.map((l) => ({ batchId: l.batchId, qty: l.qty })),
      narcoticReversals: invoice.narcoticRegisterEntries.filter((e) => !e.reversedBy).length,
    },
  });

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoice.id}/receipt`);
  revalidatePath("/dashboard");
  revalidatePath("/items");
  revalidatePath("/customers");
  revalidatePath("/reports/narcotic-register");

  return { ok: true, invoiceNo: invoice.invoiceNo };
}
