"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import type { UserRole } from "@/generated/prisma/client";
import { prisma, runInTenantTransaction } from "@/lib/prisma";
import { requireRetailSession } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import {
  computeBilling,
  effectiveDiscountPercent,
  type BillingLineInput,
  type StackedDiscountInput,
} from "@/lib/billing";
import {
  discountsNeedingOverride,
  overrideRequired,
  type OverrideScope,
} from "@/lib/discount-override";
import { serializeItem, serializeBatch } from "@/lib/serialize";
import { resolveConcreteBranch } from "@/lib/branch-scope";
import { applySchemes } from "@/lib/scheme-engine";
import { listActiveSchemesForBilling } from "@/lib/actions/schemes";
import { validateCoupon } from "@/lib/actions/coupons";
import { computeCustomerOutstandingBalances } from "@/lib/actions/customers";
import { runEinvoiceAttempt, runEwayBillAttemptForInvoice } from "@/lib/gsp/engine";
import { shouldShowPoweredBy } from "@/lib/branding";
import { listActiveInsuranceProviders } from "@/lib/actions/insurance-providers";
import { sendFeedbackRequestForInvoice } from "@/lib/actions/customer-feedback";

const REQUIRES_PRESCRIPTION: readonly string[] = ["H", "H1", "X"];

export async function getPosData() {
  const session = await requireRetailSession();
  const tenantId = session.user.tenantId;

  // POS always bills against one concrete branch's stock — never "all
  // branches" (Owner's consolidated view is for reporting, not billing).
  const branchId = await resolveConcreteBranch(tenantId, session.user.role);

  const [items, customers, doctors, tenant, schemes, branch, showPoweredBy, insuranceProviders, interactionRules] = await Promise.all([
    // Deliberately not filtered to in-stock items only (Phase 8): an
    // out-of-stock item still needs to be findable by search so the POS
    // screen can offer same-composition substitutes inline instead of the
    // search just coming up empty. Its own `batches` array is simply empty
    // in that case — see handleAddItem's existing guard against that, and
    // SearchPanel's substitute lookup.
    prisma.item.findMany({
      where: { tenantId },
      include: {
        batches: {
          where: { branchId: branchId ?? undefined, currentQty: { gt: 0 } },
          orderBy: { expiryDate: "asc" },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.customer.findMany({ where: { tenantId }, orderBy: { name: "asc" }, include: { loyaltyTier: true } }),
    prisma.doctor.findMany({ where: { tenantId }, orderBy: { name: "asc" } }),
    prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
    listActiveSchemesForBilling(tenantId),
    branchId ? prisma.branch.findUnique({ where: { id: branchId } }) : null,
    shouldShowPoweredBy(tenantId),
    listActiveInsuranceProviders(tenantId),
    // Phase 10.2: a shared, non-tenant-scoped reference catalog (see the
    // model's comment in schema.prisma) — read via the same tenant-scoped
    // `prisma` client as everything else here for consistency, but RLS
    // isn't even enabled on this table, so every tenant sees the same rows.
    prisma.interactionRule.findMany({
      select: { compositionA: true, compositionB: true, severity: true, description: true },
    }),
  ]);

  const balances = await computeCustomerOutstandingBalances(tenantId, customers.map((c) => c.id));

  return {
    items: items.map((item) => ({
      ...serializeItem(item),
      batches: item.batches.map(serializeBatch),
    })),
    customers: customers.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      creditLimit: c.creditLimit ? Number(c.creditLimit) : null,
      outstandingBalance: balances.get(c.id) ?? 0,
      loyaltyTierName: c.loyaltyTier?.name ?? null,
      loyaltyDiscountPercent: c.loyaltyTier ? Number(c.loyaltyTier.discountPercent) : 0,
    })),
    doctors,
    insuranceProviders,
    branchId,
    tenantId,
    staffDiscountCapPercent: Number(tenant.staffDiscountCapPercent),
    role: session.user.role,
    schemes,
    interactionRules,
    // Everything an offline-queued sale's locally-rendered receipt needs —
    // cached client-side so printing never requires a server round-trip.
    receiptHeader: {
      tenant: {
        pharmacyName: tenant.pharmacyName,
        invoiceFooterText: tenant.invoiceFooterText,
        logoUrl: tenant.logoUrl,
        showPoweredBy,
      },
      branch: branch
        ? {
            name: branch.name,
            licensedAddress: branch.licensedAddress,
            gstin: branch.gstin,
            drugLicenseRetailNo: branch.drugLicenseRetailNo,
            drugLicenseWholesaleNo: branch.drugLicenseWholesaleNo,
            pharmacistName: branch.pharmacistName,
            pharmacistRegistrationNo: branch.pharmacistRegistrationNo,
          }
        : null,
    },
  };
}

/**
 * Phase 10.2: the "recent purchase history" half of the duplicate-therapy
 * check — re-fetched by customerId whenever it changes, the same "client
 * preview" pattern already used for rate contracts above. Looks at the
 * customer's last 90 days of completed sales (a bounded, recent window —
 * not their entire lifetime history) and returns each distinct item name +
 * composition once, so the client can compare against what's currently in
 * the cart without a per-keystroke round trip.
 */
export async function getRecentPurchaseCompositions(customerId: string) {
  const session = await requireRetailSession();
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const lines = await prisma.salesInvoiceItem.findMany({
    where: {
      invoice: { tenantId: session.user.tenantId, customerId, status: "completed", invoiceDate: { gte: since } },
    },
    select: { item: { select: { name: true, composition: true } } },
    distinct: ["itemId"],
    take: 50,
  });
  return lines
    .filter((l) => l.item.composition?.trim())
    .map((l) => ({ name: l.item.name, composition: l.item.composition as string }));
}

/**
 * Roles that may hold a discount-override PIN. The cap only applies to
 * counter_staff, so these are the roles that can authorise past it. The ward
 * roles are absent deliberately: the POS is retail-only (requireRetailSession
 * gates it), so a ward pharmacist is never at this till.
 */
const DISCOUNT_OVERRIDE_ROLES: readonly UserRole[] = ["owner", "pharmacist"];

/**
 * Resolves an override PIN to the manager who owns it.
 *
 * Scans every override-holder in the tenant because bcrypt hashes are salted
 * — there is no way to look a PIN up by value. That is a handful of managers
 * in even a large pharmacy, and this runs once per sale that needs an
 * override, not per cart line.
 *
 * Returns the first match. `setOwnOverridePin` refuses a PIN already in use by
 * another holder in the same tenant, so "first" is also "only" — without that
 * check a collision would silently attribute an approval to the wrong person,
 * which is worse than not recording one at all.
 */
async function resolveOverrideApprover(
  tenantId: string,
  pin: string
): Promise<{ userId: string; name: string } | null> {
  const holders = await prisma.user.findMany({
    where: {
      tenantId,
      role: { in: [...DISCOUNT_OVERRIDE_ROLES] },
      overridePinHash: { not: null },
    },
    select: { id: true, name: true, overridePinHash: true },
  });
  for (const holder of holders) {
    if (await bcrypt.compare(pin, holder.overridePinHash!)) {
      return { userId: holder.id, name: holder.name };
    }
  }
  return null;
}

/**
 * Optimistic check that unlocks the override dialog at the till. completeSale
 * re-resolves the same PIN server-side before it writes any attribution — the
 * same belt-and-suspenders pattern as verifyPharmacistCredentials below.
 *
 * Returns the approver's name so the counter staffer can see whose approval
 * is about to be recorded against the sale.
 */
export async function verifyManagerPin(pin: string) {
  const session = await requireRetailSession();
  const approver = await resolveOverrideApprover(session.user.tenantId, pin);
  return approver ? { ok: true as const, approverName: approver.name } : { ok: false as const };
}

// ward_pharmacist reuses this exact permission (see rbac.ts / schema.prisma
// UserRole comment) — a hospital's OPD/central pharmacist signs off
// Schedule H/H1/X sales the same way a retail Pharmacist does.
const SIGNOFF_ROLES: readonly UserRole[] = ["pharmacist", "owner", "ward_pharmacist"];

/**
 * Optimistic check used to unlock the "Complete sale" button in the
 * re-auth dialog — completeSale re-verifies these same credentials
 * server-side before it will actually write a sign-off, the same
 * belt-and-suspenders pattern checkDiscountCap uses for the manager PIN.
 */
export async function verifyPharmacistCredentials(email: string, password: string) {
  const session = await requireRetailSession();
  const user = await prisma.user.findFirst({
    where: { tenantId: session.user.tenantId, email, role: { in: [...SIGNOFF_ROLES] } },
  });
  if (!user) return null;
  const valid = await bcrypt.compare(password, user.passwordHash);
  return valid ? { userId: user.id, name: user.name } : null;
}

async function resolvePharmacistSignoff(
  tenantId: string,
  sessionUserId: string,
  sessionRole: UserRole,
  reauth: { email: string; password: string } | undefined
): Promise<string> {
  if (SIGNOFF_ROLES.includes(sessionRole)) return sessionUserId;

  if (!reauth) throw new Error("PHARMACIST_SIGNOFF_REQUIRED");
  const user = await prisma.user.findFirst({
    where: { tenantId, email: reauth.email, role: { in: [...SIGNOFF_ROLES] } },
  });
  if (!user || !(await bcrypt.compare(reauth.password, user.passwordHash))) {
    throw new Error("PHARMACIST_SIGNOFF_REQUIRED");
  }
  return user.id;
}

const quickDoctorSchema = z.object({
  name: z.string().trim().min(1),
  registrationNo: z.string().trim().optional(),
  clinicName: z.string().trim().optional(),
});

export async function quickAddDoctor(input: z.infer<typeof quickDoctorSchema>) {
  const session = await requireRetailSession();
  const parsed = quickDoctorSchema.parse(input);
  const doctor = await prisma.doctor.create({
    data: { ...parsed, tenantId: session.user.tenantId },
  });
  revalidatePath("/pos");
  return doctor;
}

const saleLineSchema = z.object({
  itemId: z.string().min(1),
  batchId: z.string().min(1),
  qty: z.coerce.number().int().positive(),
  discountPercent: z.coerce.number().min(0).max(100).default(0),
});

const completeSaleSchema = z.object({
  branchId: z.string().min(1),
  customerId: z.string().optional().nullable(),
  doctorId: z.string().optional().nullable(),
  patientName: z.string().trim().optional(),
  patientAge: z.coerce.number().int().positive().optional(),
  paymentMode: z.enum(["cash", "upi", "card", "credit", "insurance"]),
  insuranceProviderId: z.string().optional().nullable(),
  claimNumber: z.string().trim().optional(),
  coPayAmount: z.coerce.number().min(0).optional(),
  billDiscount: z.object({
    isPercent: z.boolean(),
    value: z.coerce.number().min(0),
  }),
  couponCode: z.string().trim().optional(),
  managerPin: z.string().optional(),
  prescriptionImagePath: z.string().optional(),
  pharmacistReauth: z.object({ email: z.string().email(), password: z.string().min(1) }).optional(),
  // Set only when this sale was queued while offline and is now syncing —
  // lets a retried sync short-circuit to the already-created invoice
  // instead of double-billing if the client never saw the first response.
  offlineClientId: z.string().optional(),
  lines: z.array(saleLineSchema).min(1, "Cart is empty"),
});

export type CompleteSaleInput = z.infer<typeof completeSaleSchema>;



export async function completeSale(input: CompleteSaleInput) {
  const session = await requireRetailSession();
  const tenantId = session.user.tenantId;
  const parsed = completeSaleSchema.parse(input);

  if (parsed.offlineClientId) {
    const existing = await prisma.salesInvoice.findFirst({
      where: { tenantId, offlineClientId: parsed.offlineClientId },
      select: { id: true, invoiceNo: true },
    });
    if (existing) return { invoiceId: existing.id, invoiceNo: existing.invoiceNo };
  }

  // The upload endpoint always writes under `<sessionTenantId>/<uuid>.<ext>`.
  // Reject anything else so a client can't attach another tenant's
  // prescription image path to an invoice on this tenant — the file-serving
  // route trusts whichever invoice references a path, so this is the only
  // place that ownership actually gets checked.
  if (parsed.prescriptionImagePath && !parsed.prescriptionImagePath.startsWith(`${tenantId}/`)) {
    throw new Error("Invalid prescription image reference.");
  }

  const branch = await prisma.branch.findFirst({ where: { id: parsed.branchId, tenantId } });
  if (!branch) throw new Error("Invalid branch.");

  const batchIds = parsed.lines.map((l) => l.batchId);
  const batches = await prisma.batch.findMany({
    // branchId scoped to the invoice's own branch — a batch physically at
    // another branch (even same tenant) must never be decremented by a
    // sale rung up elsewhere.
    where: { id: { in: batchIds }, branchId: parsed.branchId, item: { tenantId } },
    include: { item: true },
  });
  const batchMap = new Map(batches.map((b) => [b.id, b]));

  for (const line of parsed.lines) {
    const batch = batchMap.get(line.batchId);
    if (!batch || batch.itemId !== line.itemId) {
      throw new Error("One of the items in the cart is no longer available.");
    }
    if (batch.currentQty < line.qty) {
      throw new Error(
        `Only ${batch.currentQty} unit(s) of ${batch.item.name} (batch ${batch.batchNo}) left in stock.`
      );
    }
  }

  const needsPrescription = parsed.lines.some((l) =>
    REQUIRES_PRESCRIPTION.includes(batchMap.get(l.batchId)!.item.scheduleClass)
  );
  if (needsPrescription && (!parsed.doctorId || !parsed.patientName)) {
    throw new Error(
      "A doctor and patient name are required for prescription (Schedule H/H1/X) items."
    );
  }

  // A Pharmacist/Owner already at the till signs off via their own session;
  // Counter Staff must have a Pharmacist/Owner re-authenticate first.
  const signoffUserId = needsPrescription
    ? await resolvePharmacistSignoff(
        tenantId,
        session.user.id,
        session.user.role,
        parsed.pharmacistReauth
      )
    : null;

  const customer = parsed.customerId
    ? await prisma.customer.findFirst({
        where: { id: parsed.customerId, tenantId },
        include: { loyaltyTier: true },
      })
    : null;

  // Phase 9: rate contracts — re-fetched and re-checked server-side, same
  // "client badge is a preview, never a trusted input" rule as schemes
  // above. Directly replaces the batch's normal saleRate wherever it feeds
  // into billing math (scheme evaluation, billingLines, and the persisted
  // SalesInvoiceItem.rate itself) — a contract isn't a discount over MRP,
  // it's a different agreed base rate, so it doesn't get its own Discount row.
  const contractRateByItemId = new Map<string, number>();
  if (customer) {
    const itemIds = [...new Set(parsed.lines.map((l) => l.itemId))];
    const now = new Date();
    const contracts = await prisma.rateContract.findMany({
      where: {
        tenantId,
        customerId: customer.id,
        itemId: { in: itemIds },
        active: true,
        validFrom: { lte: now },
        validTo: { gte: now },
      },
    });
    for (const c of contracts) contractRateByItemId.set(c.itemId, Number(c.contractRate));
  }
  function effectiveRate(itemId: string, batch: { saleRate: unknown }): number {
    return contractRateByItemId.get(itemId) ?? Number(batch.saleRate);
  }

  if (parsed.paymentMode === "credit") {
    if (!customer) {
      throw new Error("Select a customer with a credit limit for credit sales.");
    }
    if (customer.creditLimit === null) {
      throw new Error("Selected customer does not have a credit account.");
    }
  }

  const insuranceProvider =
    parsed.paymentMode === "insurance" && parsed.insuranceProviderId
      ? await prisma.insuranceProvider.findFirst({
          where: { id: parsed.insuranceProviderId, tenantId, active: true },
        })
      : null;
  if (parsed.paymentMode === "insurance" && !insuranceProvider) {
    throw new Error("Select an insurance provider for a cashless sale.");
  }

  // Schemes are re-fetched and re-evaluated server-side — the client's
  // "why" badges are a preview, never a trusted input.
  const activeSchemes = await listActiveSchemesForBilling(tenantId);
  const schemeApplications = applySchemes(
    activeSchemes,
    parsed.lines.map((l) => ({
      lineId: `${l.itemId}:${l.batchId}`,
      itemId: l.itemId,
      qty: l.qty,
      rate: effectiveRate(l.itemId, batchMap.get(l.batchId)!),
    }))
  );
  const schemeByLineId = new Map(schemeApplications.map((a) => [a.lineId, a]));

  const couponResult = parsed.couponCode
    ? await validateCoupon(parsed.couponCode, parsed.customerId ?? null)
    : null;
  if (parsed.couponCode && (!couponResult || !couponResult.valid || !couponResult.coupon)) {
    throw new Error(couponResult?.error ?? "Invalid coupon code.");
  }
  const coupon = couponResult?.coupon ?? null;

  const billingLines: BillingLineInput[] = parsed.lines.map((l) => {
    const batch = batchMap.get(l.batchId)!;
    const lineId = `${l.itemId}:${l.batchId}`;
    return {
      lineId,
      qty: l.qty,
      rate: effectiveRate(l.itemId, batch),
      taxRate: Number(batch.item.taxRate),
      discountPercent: l.discountPercent,
      schemeDiscountAmount: schemeByLineId.get(lineId)?.discountAmount ?? 0,
    };
  });

  const billDiscounts: StackedDiscountInput[] = [
    { type: "bill", isPercent: parsed.billDiscount.isPercent, value: parsed.billDiscount.value },
  ];
  if (customer?.loyaltyTier) {
    billDiscounts.push({ type: "loyalty", isPercent: true, value: Number(customer.loyaltyTier.discountPercent) });
  }
  if (coupon) {
    billDiscounts.push({ type: "coupon", isPercent: coupon.type === "percent", value: coupon.value });
  }

  const billing = computeBilling(billingLines, billDiscounts);

  const coPayAmount = parsed.paymentMode === "insurance" ? (parsed.coPayAmount ?? 0) : 0;
  if (parsed.paymentMode === "insurance" && coPayAmount > billing.total) {
    throw new Error("Co-pay amount cannot exceed the total bill.");
  }

  // Discount-cap check, defense in depth (client already gates this).
  // Only the manual item/bill discounts are staff decisions subject to the
  // cap — scheme/loyalty/coupon discounts are system-applied, not entered
  // by staff, so they're excluded from the override check and never carry
  // an approval.
  let overrideScope: OverrideScope = { lineIndices: new Set(), bill: false };
  let approver: { userId: string; name: string } | null = null;
  let staffDiscountCapPercent: number | null = null;
  if (session.user.role === "counter_staff") {
    const t = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    staffDiscountCapPercent = Number(t.staffDiscountCapPercent);
    overrideScope = discountsNeedingOverride(
      staffDiscountCapPercent,
      session.user.role,
      parsed.lines.map((l) => l.discountPercent),
      effectiveDiscountPercent(parsed.billDiscount, billing.subtotal)
    );
  }
  if (overrideRequired(overrideScope)) {
    // Resolved once per sale, not once per line: this is a bcrypt scan over
    // the tenant's override holders.
    approver = parsed.managerPin
      ? await resolveOverrideApprover(tenantId, parsed.managerPin)
      : null;
    // Fails closed. Before per-user PINs a tenant with no PIN configured hit
    // this same error with no way to satisfy it; now any owner or pharmacist
    // can set their own PIN in Settings and unblock the till.
    if (!approver) throw new Error("MANAGER_PIN_REQUIRED");
  }

  const now = new Date();
  const monthKey = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;

  const result = await runInTenantTransaction(async (tx) => {
    const countThisMonth = await tx.salesInvoice.count({
      where: { tenantId, invoiceNo: { startsWith: `INV-${monthKey}-` } },
    });
    const invoiceNo = `INV-${monthKey}-${String(countThisMonth + 1).padStart(4, "0")}`;

    const invoice = await tx.salesInvoice.create({
      data: {
        tenantId,
        branchId: parsed.branchId,
        customerId: parsed.customerId || null,
        doctorId: parsed.doctorId || null,
        patientName: parsed.patientName || null,
        patientAge: parsed.patientAge ?? null,
        invoiceNo,
        offlineClientId: parsed.offlineClientId || null,
        subtotal: billing.subtotal,
        taxAmount: billing.taxAmount,
        discountAmount: billing.discountAmount,
        total: billing.total,
        paymentMode: parsed.paymentMode,
        status: "completed",
        prescriptionImageUrl: parsed.prescriptionImagePath || null,
        pharmacistSignoffUserId: signoffUserId,
        pharmacistSignoffAt: signoffUserId ? now : null,
      },
    });

    if (parsed.paymentMode === "insurance" && insuranceProvider) {
      await tx.insuranceClaim.create({
        data: {
          tenantId,
          invoiceId: invoice.id,
          insuranceProviderId: insuranceProvider.id,
          claimNumber: parsed.claimNumber || null,
          claimedAmount: billing.total - coPayAmount,
          coPayAmount,
        },
      });
    }

    for (let i = 0; i < parsed.lines.length; i++) {
      const line = parsed.lines[i];
      const lineBilling = billing.lines[i];
      const batch = batchMap.get(line.batchId)!;

      const invoiceItem = await tx.salesInvoiceItem.create({
        data: {
          invoiceId: invoice.id,
          itemId: line.itemId,
          batchId: line.batchId,
          qty: line.qty,
          rate: effectiveRate(line.itemId, batch),
          taxRate: batch.item.taxRate,
          discountAmount:
            lineBilling.itemDiscountAmount + lineBilling.schemeDiscountAmount + lineBilling.billDiscountShare,
        },
      });

      if (line.discountPercent > 0) {
        await tx.discount.create({
          data: {
            tenantId,
            invoiceId: invoice.id,
            invoiceItemId: invoiceItem.id,
            type: "item",
            amountOrPercent: line.discountPercent,
            isPercent: true,
            amount: lineBilling.itemDiscountAmount,
            appliedByUserId: session.user.id,
            // Only the lines that actually breached the cap carry the
            // approval — a 5% discount on line 2 was not what the manager
            // was asked about.
            requiredOverride: overrideScope.lineIndices.has(i),
            approvedByUserId: overrideScope.lineIndices.has(i) ? approver!.userId : null,
          },
        });
      }

      const schemeApplied = schemeByLineId.get(`${line.itemId}:${line.batchId}`);
      if (schemeApplied && lineBilling.schemeDiscountAmount > 0) {
        await tx.discount.create({
          data: {
            tenantId,
            invoiceId: invoice.id,
            invoiceItemId: invoiceItem.id,
            type: "scheme",
            schemeId: schemeApplied.schemeId,
            amountOrPercent: lineBilling.schemeDiscountAmount,
            isPercent: false,
            amount: lineBilling.schemeDiscountAmount,
            appliedByUserId: session.user.id,
          },
        });
      }

      const updateResult = await tx.batch.updateMany({
        where: { id: line.batchId, currentQty: { gte: line.qty } },
        data: { currentQty: { decrement: line.qty } },
      });
      if (updateResult.count === 0) {
        throw new Error(
          `Stock for ${batch.item.name} (batch ${batch.batchNo}) changed — please review the cart and try again.`
        );
      }

      if (batch.item.scheduleClass === "X") {
        await tx.narcoticRegisterEntry.create({
          data: {
            tenantId,
            branchId: parsed.branchId,
            invoiceId: invoice.id,
            itemId: line.itemId,
            batchId: line.batchId,
            qty: line.qty,
            doctorId: parsed.doctorId || null,
            patientName: parsed.patientName || null,
            // Schedule X is in REQUIRES_PRESCRIPTION, so needsPrescription
            // is true whenever this branch runs and signoffUserId is
            // already resolved — the pharmacist who signed off the
            // dispense, not necessarily whoever rang up the sale.
            dispensedByUserId: signoffUserId!,
          },
        });
      }
    }

    if (parsed.billDiscount.value > 0) {
      await tx.discount.create({
        data: {
          tenantId,
          invoiceId: invoice.id,
          type: "bill",
          amountOrPercent: parsed.billDiscount.value,
          isPercent: parsed.billDiscount.isPercent,
          amount: billing.billDiscounts.find((d) => d.type === "bill")?.amount ?? 0,
          appliedByUserId: session.user.id,
          requiredOverride: overrideScope.bill,
          approvedByUserId: overrideScope.bill ? approver!.userId : null,
        },
      });
    }

    if (customer?.loyaltyTier) {
      await tx.discount.create({
        data: {
          tenantId,
          invoiceId: invoice.id,
          type: "loyalty",
          amountOrPercent: customer.loyaltyTier.discountPercent,
          isPercent: true,
          amount: billing.billDiscounts.find((d) => d.type === "loyalty")?.amount ?? 0,
          appliedByUserId: session.user.id,
        },
      });
    }

    if (coupon) {
      // Re-checked inside the transaction against concurrent use — the
      // pre-transaction validateCoupon call is only an optimistic check.
      const fresh = await tx.coupon.findUnique({ where: { id: coupon.id } });
      if (!fresh) throw new Error("Coupon is no longer available.");
      if (fresh.usageLimit !== null && fresh.usageCount >= fresh.usageLimit) {
        throw new Error("Coupon usage limit reached — remove it and try again.");
      }
      if (fresh.singleUsePerCustomer && parsed.customerId) {
        const alreadyUsed = await tx.discount.findFirst({
          where: { couponId: coupon.id, invoice: { customerId: parsed.customerId } },
        });
        if (alreadyUsed) throw new Error("This customer has already used this coupon.");
      }
      const couponUpdate = await tx.coupon.updateMany({
        where: {
          id: coupon.id,
          ...(fresh.usageLimit !== null ? { usageCount: { lt: fresh.usageLimit } } : {}),
        },
        data: { usageCount: { increment: 1 } },
      });
      if (couponUpdate.count === 0) {
        throw new Error("Coupon usage limit reached — remove it and try again.");
      }
      await tx.discount.create({
        data: {
          tenantId,
          invoiceId: invoice.id,
          type: "coupon",
          couponId: coupon.id,
          amountOrPercent: coupon.value,
          isPercent: coupon.type === "percent",
          amount: billing.billDiscounts.find((d) => d.type === "coupon")?.amount ?? 0,
          appliedByUserId: session.user.id,
        },
      });
    }

    if (parsed.customerId) {
      const updated = await tx.customer.update({
        where: { id: parsed.customerId },
        data: { cumulativeSpend: { increment: billing.total } },
      });

      if (parsed.paymentMode === "credit") {
        await tx.customerLedgerEntry.create({
          data: {
            tenantId,
            customerId: parsed.customerId,
            type: "sale",
            amount: billing.total,
            referenceId: invoice.id,
            referenceType: "SalesInvoice",
          },
        });
      }

      const tiers = await tx.loyaltyTier.findMany({
        where: { tenantId },
        orderBy: { minCumulativeSpend: "desc" },
      });
      const newSpend = Number(updated.cumulativeSpend);
      const newTier = tiers.find((t) => Number(t.minCumulativeSpend) <= newSpend) ?? null;
      if ((newTier?.id ?? null) !== updated.loyaltyTierId) {
        await tx.customer.update({
          where: { id: parsed.customerId },
          data: { loyaltyTierId: newTier?.id ?? null },
        });
      }
    }

    return invoice;
  });

  await writeAuditLog({
    tenantId,
    userId: session.user.id,
    action: "sale.complete",
    entity: "SalesInvoice",
    entityId: result.id,
    after: { invoiceNo: result.invoiceNo, total: billing.total },
  });

  // A separate row for the override, rather than a field on the sale entry:
  // this is the event an owner reviewing discount abuse actually searches
  // for, and it should be findable without reading every sale. userId stays
  // the staffer who rang up the sale — the actor — with the approver named
  // in the payload alongside what they approved.
  if (approver) {
    await writeAuditLog({
      tenantId,
      userId: session.user.id,
      action: "sale.discount_override",
      entity: "SalesInvoice",
      entityId: result.id,
      after: {
        invoiceNo: result.invoiceNo,
        approvedByUserId: approver.userId,
        approvedByName: approver.name,
        capPercent: staffDiscountCapPercent,
        billDiscountOverridden: overrideScope.bill,
        overriddenLinePercents: [...overrideScope.lineIndices].map(
          (i) => parsed.lines[i].discountPercent
        ),
      },
    });
  }

  revalidatePath("/items");
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
  revalidatePath("/customers");
  revalidatePath("/insurance-claims");

  // Fire-and-forget: the counter transaction (sale saved, ready to print)
  // is already complete and its response about to return. A slow or down
  // GSP must never add latency here — this keeps running on the same
  // long-lived Node process after the response is sent, and any failure is
  // swallowed (retryable later from the receipt screen), never surfaced as
  // a checkout error.
  void runEinvoiceAttempt(result.id).catch(() => {});
  void runEwayBillAttemptForInvoice(result.id).catch(() => {});
  void sendFeedbackRequestForInvoice(result.id).catch(() => {});

  return { invoiceId: result.id, invoiceNo: result.invoiceNo };
}
