"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma, runInTenantTransaction } from "@/lib/prisma";
import { requireRole, requireSession } from "@/lib/rbac";
import { getBranchFilter } from "@/lib/branch-scope";
import { writeAuditLog } from "@/lib/audit";
import {
  canRaiseCreditNote,
  computeCreditNote,
  remainingQty,
  CREDIT_NOTE_ROLES,
  type ReturnableLine,
} from "@/lib/credit-note";

/**
 * Customer returns, as GST credit notes.
 *
 * This is the instrument for everything same-day cancellation cannot reach
 * (see invoice-cancellation.ts): the original invoice stands, and a separate
 * document reduces it. Partial by design — a customer bringing back two of
 * five strips gets a credit note for two.
 *
 * Schedule X items are deliberately refused. Their register is a legal
 * insert-only record whose reversal rows are one-per-entry, which cannot
 * express a partial return, and a returned narcotic is not resalable anyway.
 * The register's own reversal path handles those.
 */

const SCHEDULE_X = "X";

const createSchema = z.object({
  reason: z.string().trim().min(5, "Give a short reason (at least 5 characters)").max(300),
  // The one decision that moves stock: were the goods fit to sell again?
  restocked: z.boolean(),
  refundMode: z.enum(["cash", "upi", "card", "ledger_adjustment"]),
  lines: z
    .array(z.object({ invoiceItemId: z.string().min(1), qty: z.coerce.number().int().min(0) }))
    .min(1, "Nothing selected to return"),
});

export type CreateCreditNoteResult =
  | { ok: true; creditNoteId: string; creditNoteNo: string; total: number }
  | { ok: false; error: string };

/** The invoice, its lines, and how much of each is still returnable. */
export async function getInvoiceForReturn(invoiceId: string) {
  const session = await requireRole([...CREDIT_NOTE_ROLES]);

  const invoice = await prisma.salesInvoice.findFirst({
    where: { id: invoiceId, tenantId: session.user.tenantId },
    include: {
      customer: { select: { id: true, name: true } },
      items: {
        include: {
          item: { select: { id: true, name: true, scheduleClass: true } },
          batch: { select: { id: true, batchNo: true, expiryDate: true } },
          creditNoteItems: { select: { qty: true } },
        },
      },
    },
  });
  if (!invoice) return null;

  const lines = invoice.items.map((item) => ({
    invoiceItemId: item.id,
    itemId: item.itemId,
    batchId: item.batchId,
    itemName: item.item.name,
    batchNo: item.batch.batchNo,
    scheduleClass: item.item.scheduleClass,
    soldQty: item.qty,
    returnedQty: item.creditNoteItems.reduce((sum, c) => sum + c.qty, 0),
    rate: Number(item.rate),
    taxRate: Number(item.taxRate),
    discountAmount: Number(item.discountAmount),
  }));

  const eligibility = canRaiseCreditNote(invoice, lines, new Date());

  return {
    invoiceId: invoice.id,
    invoiceNo: invoice.invoiceNo,
    invoiceDate: invoice.invoiceDate,
    paymentMode: invoice.paymentMode,
    customer: invoice.customer,
    lines: lines.map((l) => ({ ...l, remainingQty: remainingQty(l) })),
    eligibility,
  };
}

export async function createCreditNote(
  invoiceId: string,
  input: z.input<typeof createSchema>
): Promise<CreateCreditNoteResult> {
  const session = await requireRole([...CREDIT_NOTE_ROLES]);
  const tenantId = session.user.tenantId;

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const invoice = await prisma.salesInvoice.findFirst({
    where: { id: invoiceId, tenantId },
    include: {
      items: {
        include: {
          item: { select: { scheduleClass: true, name: true } },
          creditNoteItems: { select: { qty: true } },
        },
      },
    },
  });
  if (!invoice) return { ok: false, error: "Invoice not found" };

  const returnable: ReturnableLine[] = invoice.items.map((item) => ({
    invoiceItemId: item.id,
    itemId: item.itemId,
    batchId: item.batchId,
    soldQty: item.qty,
    returnedQty: item.creditNoteItems.reduce((sum, c) => sum + c.qty, 0),
    rate: Number(item.rate),
    taxRate: Number(item.taxRate),
    discountAmount: Number(item.discountAmount),
  }));

  const eligibility = canRaiseCreditNote(invoice, returnable, new Date());
  if (!eligibility.allowed) return { ok: false, error: eligibility.message! };

  const qtyByLine: Record<string, number> = {};
  for (const line of parsed.data.lines) {
    if (line.qty > 0) qtyByLine[line.invoiceItemId] = line.qty;
  }
  if (Object.keys(qtyByLine).length === 0) {
    return { ok: false, error: "Enter a quantity for at least one item." };
  }

  const byId = new Map(returnable.map((l) => [l.invoiceItemId, l]));
  const itemsById = new Map(invoice.items.map((i) => [i.id, i]));
  for (const [invoiceItemId, qty] of Object.entries(qtyByLine)) {
    const line = byId.get(invoiceItemId);
    if (!line) return { ok: false, error: "That line is not on this invoice." };

    const scheduleClass = itemsById.get(invoiceItemId)?.item.scheduleClass;
    if (scheduleClass === SCHEDULE_X) {
      return {
        ok: false,
        error: `${itemsById.get(invoiceItemId)?.item.name} is a Schedule X drug and cannot be returned through a credit note — correct the narcotic register directly instead.`,
      };
    }

    const available = remainingQty(line);
    if (qty > available) {
      return {
        ok: false,
        error: `Only ${available} of ${itemsById.get(invoiceItemId)?.item.name} can still be returned (${line.soldQty} sold, ${line.returnedQty} already returned).`,
      };
    }
  }

  if (parsed.data.refundMode === "ledger_adjustment" && !invoice.customerId) {
    return {
      ok: false,
      error: "This was a walk-in sale with no customer account to adjust — refund in cash, UPI or card.",
    };
  }

  const totals = computeCreditNote(returnable, qtyByLine);
  const now = new Date();
  const monthKey = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;

  const created = await runInTenantTransaction(async (tx) => {
    // Re-check remaining quantities inside the transaction. Two staff members
    // processing the same return at once would otherwise both pass the check
    // above and credit the customer twice for one set of goods.
    const fresh = await tx.salesInvoiceItem.findMany({
      where: { invoiceId: invoice.id },
      select: { id: true, qty: true, creditNoteItems: { select: { qty: true } } },
    });
    for (const [invoiceItemId, qty] of Object.entries(qtyByLine)) {
      const line = fresh.find((f) => f.id === invoiceItemId);
      const already = line?.creditNoteItems.reduce((sum, c) => sum + c.qty, 0) ?? 0;
      if (!line || qty > line.qty - already) {
        throw new Error("Someone else just returned these items — reload and check what is left.");
      }
    }

    // Own consecutive series, independent of the invoice numbering: GST
    // treats a credit note as a document in its own right.
    const countThisMonth = await tx.creditNote.count({
      where: { tenantId, creditNoteNo: { startsWith: `CN-${monthKey}-` } },
    });
    const creditNoteNo = `CN-${monthKey}-${String(countThisMonth + 1).padStart(4, "0")}`;

    const creditNote = await tx.creditNote.create({
      data: {
        tenantId,
        branchId: invoice.branchId,
        invoiceId: invoice.id,
        creditNoteNo,
        reason: parsed.data.reason,
        restocked: parsed.data.restocked,
        subtotal: totals.subtotal,
        taxAmount: totals.taxAmount,
        total: totals.total,
        refundMode: parsed.data.refundMode,
        createdByUserId: session.user.id,
      },
    });

    for (const line of totals.lines) {
      await tx.creditNoteItem.create({
        data: {
          creditNoteId: creditNote.id,
          invoiceItemId: line.invoiceItemId,
          itemId: line.itemId,
          batchId: line.batchId,
          qty: line.qty,
          rate: line.rate,
          taxRate: line.taxRate,
          discountAmount: line.discountAmount,
          taxableValue: line.taxableValue,
          taxAmount: line.taxAmount,
        },
      });

      // Only when the goods are fit to sell again. A write-off still credits
      // the customer their money and the tax — the shop simply eats the
      // stock, which is the honest outcome for a damaged return.
      if (parsed.data.restocked) {
        await tx.batch.update({
          where: { id: line.batchId },
          data: { currentQty: { increment: line.qty } },
        });
      }
    }

    if (invoice.customerId) {
      if (parsed.data.refundMode === "ledger_adjustment") {
        await tx.customerLedgerEntry.create({
          data: {
            tenantId,
            customerId: invoice.customerId,
            type: "credit_note",
            amount: -totals.total,
            referenceId: creditNote.id,
            referenceType: "CreditNote",
            note: `Credit note ${creditNoteNo} against ${invoice.invoiceNo}`,
          },
        });
      }

      // Lifetime spend drops by what was credited, whichever way the money
      // went back, and the loyalty tier is recomputed from the new total
      // rather than assumed unchanged.
      const updated = await tx.customer.update({
        where: { id: invoice.customerId },
        data: { cumulativeSpend: { decrement: totals.total } },
      });
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

    return creditNote;
  });

  await writeAuditLog({
    tenantId,
    userId: session.user.id,
    action: "credit_note.create",
    entity: "CreditNote",
    entityId: created.id,
    after: {
      creditNoteNo: created.creditNoteNo,
      againstInvoice: invoice.invoiceNo,
      reason: parsed.data.reason,
      restocked: parsed.data.restocked,
      refundMode: parsed.data.refundMode,
      subtotal: totals.subtotal,
      taxAmount: totals.taxAmount,
      total: totals.total,
      // The stock movement, reconstructable from the log alone.
      lines: totals.lines.map((l) => ({ batchId: l.batchId, qty: l.qty })),
    },
  });

  revalidatePath("/credit-notes");
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoice.id}/receipt`);
  revalidatePath("/items");
  revalidatePath("/customers");
  revalidatePath("/dashboard");

  return {
    ok: true,
    creditNoteId: created.id,
    creditNoteNo: created.creditNoteNo,
    total: totals.total,
  };
}

export async function listCreditNotes(from?: string, to?: string) {
  const session = await requireSession();
  const branchFilter = await getBranchFilter(session.user.tenantId, session.user.role);

  const where = {
    tenantId: session.user.tenantId,
    ...branchFilter,
    ...(from && to
      ? {
          creditNoteDate: {
            gte: new Date(from),
            lte: (() => {
              const end = new Date(to);
              end.setHours(23, 59, 59, 999);
              return end;
            })(),
          },
        }
      : {}),
  };

  const notes = await prisma.creditNote.findMany({
    where,
    orderBy: { creditNoteDate: "desc" },
    include: {
      invoice: { select: { id: true, invoiceNo: true } },
      createdBy: { select: { name: true } },
      items: { select: { qty: true } },
    },
    take: 200,
  });

  return notes.map((n) => ({
    id: n.id,
    creditNoteNo: n.creditNoteNo,
    creditNoteDate: n.creditNoteDate,
    invoiceId: n.invoice.id,
    invoiceNo: n.invoice.invoiceNo,
    reason: n.reason,
    restocked: n.restocked,
    refundMode: n.refundMode,
    unitCount: n.items.reduce((sum, i) => sum + i.qty, 0),
    subtotal: Number(n.subtotal),
    taxAmount: Number(n.taxAmount),
    total: Number(n.total),
    createdByName: n.createdBy.name,
  }));
}

export async function getCreditNote(id: string) {
  const session = await requireSession();
  const note = await prisma.creditNote.findFirst({
    where: { id, tenantId: session.user.tenantId },
    include: {
      branch: true,
      createdBy: { select: { name: true } },
      invoice: {
        select: {
          id: true,
          invoiceNo: true,
          invoiceDate: true,
          customer: { select: { name: true, phone: true } },
        },
      },
      items: {
        include: {
          item: { select: { name: true, hsnCode: true } },
          batch: { select: { batchNo: true } },
        },
      },
    },
  });
  if (!note) return null;

  return {
    id: note.id,
    creditNoteNo: note.creditNoteNo,
    creditNoteDate: note.creditNoteDate,
    reason: note.reason,
    restocked: note.restocked,
    refundMode: note.refundMode,
    subtotal: Number(note.subtotal),
    taxAmount: Number(note.taxAmount),
    total: Number(note.total),
    createdByName: note.createdBy.name,
    invoice: {
      id: note.invoice.id,
      invoiceNo: note.invoice.invoiceNo,
      invoiceDate: note.invoice.invoiceDate,
      customerName: note.invoice.customer?.name ?? "Walk-in",
      customerPhone: note.invoice.customer?.phone ?? null,
    },
    branch: {
      name: note.branch.name,
      licensedAddress: note.branch.licensedAddress,
      gstin: note.branch.gstin,
    },
    items: note.items.map((i) => ({
      itemName: i.item.name,
      hsnCode: i.item.hsnCode,
      batchNo: i.batch.batchNo,
      qty: i.qty,
      rate: Number(i.rate),
      taxRate: Number(i.taxRate),
      discountAmount: Number(i.discountAmount),
      taxableValue: Number(i.taxableValue),
      taxAmount: Number(i.taxAmount),
    })),
  };
}
