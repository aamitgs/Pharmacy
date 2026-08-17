"use server";

import { z } from "zod";
import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { basePrisma, prisma, tenantContext } from "@/lib/prisma";
import { sendWhatsAppMessage } from "@/lib/whatsapp/provider";
import {
  createCustomerSession,
  destroyCustomerSession,
  getCustomerSession,
  requireCustomerSession,
} from "@/lib/customer-auth";

const OTP_TTL_MINUTES = 10;
const OTP_RESEND_COOLDOWN_SECONDS = 60;

function hashOtp(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

function generateOtp(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/**
 * Looks a tenant up by its portal slug before any tenant is known — same
 * "the one legitimate cross-tenant read" pattern src/auth.ts's
 * findUserForLogin uses for staff login, batched with the bypass flag in a
 * single transaction so it's never left set on the connection afterwards.
 * Public info only (name/branding), safe to read pre-auth.
 */
export async function getPortalTenantBySlug(slug: string) {
  const [, tenant] = await basePrisma.$transaction([
    basePrisma.$executeRaw`SELECT set_config('app.rls_bypass', 'true', true)`,
    basePrisma.tenant.findUnique({
      where: { portalSlug: slug },
      select: { id: true, pharmacyName: true, logoUrl: true, primaryColor: true, portalSlug: true },
    }),
  ]);
  return tenant;
}

const phoneSchema = z.string().trim().min(6).max(15);

/**
 * Sends (or silently no-ops) an OTP for the phone number entered. Always
 * returns success from the caller's point of view — never confirms or
 * denies whether a phone number is a registered customer, standard OTP-UX
 * practice — the WhatsApp send (and therefore anything actually
 * happening) only fires if a matching Customer record exists.
 */
export async function requestPortalOtp(slug: string, phoneInput: string): Promise<{ ok: true }> {
  const phone = phoneSchema.parse(phoneInput);
  const tenant = await getPortalTenantBySlug(slug);
  if (!tenant) return { ok: true };

  const [, customer] = await basePrisma.$transaction([
    basePrisma.$executeRaw`SELECT set_config('app.rls_bypass', 'true', true)`,
    basePrisma.customer.findFirst({ where: { tenantId: tenant.id, phone } }),
  ]);
  if (!customer) return { ok: true };

  const [, recent] = await basePrisma.$transaction([
    basePrisma.$executeRaw`SELECT set_config('app.rls_bypass', 'true', true)`,
    basePrisma.customerOtp.findFirst({
      where: { customerId: customer.id },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  if (recent && Date.now() - recent.createdAt.getTime() < OTP_RESEND_COOLDOWN_SECONDS * 1000) {
    return { ok: true };
  }

  const code = generateOtp();
  await basePrisma.$transaction([
    basePrisma.$executeRaw`SELECT set_config('app.rls_bypass', 'true', true)`,
    basePrisma.customerOtp.create({
      data: {
        tenantId: tenant.id,
        customerId: customer.id,
        codeHash: hashOtp(code),
        expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000),
      },
    }),
  ]);

  await sendWhatsAppMessage({
    to: phone,
    text: `Your ${tenant.pharmacyName} portal code is ${code}. Valid for ${OTP_TTL_MINUTES} minutes. Do not share this code.`,
  });

  return { ok: true };
}

const verifySchema = z.object({
  phone: phoneSchema,
  code: z.string().trim().length(6),
});

export async function verifyPortalOtp(slug: string, input: { phone: string; code: string }): Promise<{ ok: boolean; error?: string }> {
  const parsed = verifySchema.parse(input);
  const tenant = await getPortalTenantBySlug(slug);
  if (!tenant) return { ok: false, error: "Portal not found." };

  const [, customer] = await basePrisma.$transaction([
    basePrisma.$executeRaw`SELECT set_config('app.rls_bypass', 'true', true)`,
    basePrisma.customer.findFirst({ where: { tenantId: tenant.id, phone: parsed.phone } }),
  ]);
  if (!customer) return { ok: false, error: "Incorrect code. Please try again." };

  const [, otp] = await basePrisma.$transaction([
    basePrisma.$executeRaw`SELECT set_config('app.rls_bypass', 'true', true)`,
    basePrisma.customerOtp.findFirst({
      where: { customerId: customer.id, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  if (!otp || otp.codeHash !== hashOtp(parsed.code)) {
    return { ok: false, error: "Incorrect or expired code. Please try again." };
  }

  await basePrisma.$transaction([
    basePrisma.$executeRaw`SELECT set_config('app.rls_bypass', 'true', true)`,
    basePrisma.customerOtp.update({ where: { id: otp.id }, data: { consumedAt: new Date() } }),
  ]);

  await createCustomerSession(slug, { tenantId: tenant.id, customerId: customer.id });
  return { ok: true };
}

export async function portalSignOut(slug: string) {
  await destroyCustomerSession(slug);
}

export async function getPortalSession(slug: string) {
  return getCustomerSession(slug);
}

/** Full profile for the header/greeting — separate from the raw session (which is deliberately just ids) so pages don't each re-fetch the customer row themselves. */
export async function getPortalCustomer(slug: string) {
  const session = await requireCustomerSession(slug);
  return tenantContext.run({ tenantId: session.tenantId }, async () => {
    const customer = await prisma.customer.findUniqueOrThrow({
      where: { id: session.customerId },
      include: { loyaltyTier: true },
    });
    return {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      cumulativeSpend: Number(customer.cumulativeSpend),
      loyaltyTierName: customer.loyaltyTier?.name ?? null,
      loyaltyDiscountPercent: customer.loyaltyTier ? Number(customer.loyaltyTier.discountPercent) : 0,
    };
  });
}

export async function getPortalLoyaltyStatus(slug: string) {
  const session = await requireCustomerSession(slug);
  return tenantContext.run({ tenantId: session.tenantId }, async () => {
    const [customer, tiers] = await Promise.all([
      prisma.customer.findUniqueOrThrow({ where: { id: session.customerId }, include: { loyaltyTier: true } }),
      prisma.loyaltyTier.findMany({ where: { tenantId: session.tenantId }, orderBy: { minCumulativeSpend: "asc" } }),
    ]);
    const cumulativeSpend = Number(customer.cumulativeSpend);
    const nextTier = tiers.find((t) => Number(t.minCumulativeSpend) > cumulativeSpend) ?? null;
    return {
      cumulativeSpend,
      currentTierName: customer.loyaltyTier?.name ?? null,
      currentDiscountPercent: customer.loyaltyTier ? Number(customer.loyaltyTier.discountPercent) : 0,
      nextTierName: nextTier?.name ?? null,
      amountToNextTier: nextTier ? round2(Number(nextTier.minCumulativeSpend) - cumulativeSpend) : null,
    };
  });
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export async function listPortalPurchaseHistory(slug: string) {
  const session = await requireCustomerSession(slug);
  return tenantContext.run({ tenantId: session.tenantId }, async () => {
    const invoices = await prisma.salesInvoice.findMany({
      where: { customerId: session.customerId, status: "completed" },
      include: { items: { select: { id: true } }, branch: { select: { name: true } } },
      orderBy: { invoiceDate: "desc" },
    });
    return invoices.map((inv) => ({
      id: inv.id,
      invoiceNo: inv.invoiceNo,
      invoiceDate: inv.invoiceDate,
      branchName: inv.branch.name,
      total: Number(inv.total),
      itemCount: inv.items.length,
    }));
  });
}

export async function getPortalInvoice(slug: string, invoiceId: string) {
  const session = await requireCustomerSession(slug);
  return tenantContext.run({ tenantId: session.tenantId }, async () => {
    const invoice = await prisma.salesInvoice.findFirst({
      where: { id: invoiceId, customerId: session.customerId },
      include: {
        branch: { select: { name: true, licensedAddress: true, gstin: true } },
        items: { include: { item: { select: { name: true, unit: true } } } },
      },
    });
    if (!invoice) return null;
    return {
      id: invoice.id,
      invoiceNo: invoice.invoiceNo,
      invoiceDate: invoice.invoiceDate,
      branchName: invoice.branch.name,
      subtotal: Number(invoice.subtotal),
      discountAmount: Number(invoice.discountAmount),
      taxAmount: Number(invoice.taxAmount),
      total: Number(invoice.total),
      items: invoice.items.map((i) => ({
        itemName: i.item.name,
        unit: i.item.unit,
        qty: i.qty,
        rate: Number(i.rate),
        lineTotal: round2(i.qty * Number(i.rate) - Number(i.discountAmount)),
      })),
    };
  });
}

const refillRequestSchema = z.object({
  invoiceId: z.string().min(1),
  note: z.string().trim().max(300).optional(),
});

/**
 * Deliberately does NOT create a sale — just a flagged request the
 * pharmacy's own staff see and act on (src/app/(app)/refill-requests). A
 * human still rings up the actual refill through the normal POS screen.
 */
export async function createPortalRefillRequest(slug: string, input: { invoiceId: string; note?: string }) {
  const session = await requireCustomerSession(slug);
  const parsed = refillRequestSchema.parse(input);

  return tenantContext.run({ tenantId: session.tenantId }, async () => {
    const invoice = await prisma.salesInvoice.findFirst({
      where: { id: parsed.invoiceId, customerId: session.customerId },
    });
    if (!invoice) throw new Error("Order not found.");

    const request = await prisma.refillRequest.create({
      data: {
        tenantId: session.tenantId,
        customerId: session.customerId,
        invoiceId: invoice.id,
        note: parsed.note || null,
      },
    });
    revalidatePath("/refill-requests");
    revalidatePath("/dashboard");
    return { id: request.id };
  });
}
