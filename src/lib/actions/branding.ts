"use server";

import { z } from "zod";
import crypto from "node:crypto";
import dns from "node:dns/promises";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { slugify } from "@/lib/slug";

export async function getBrandingInfo() {
  const session = await requireRole(["owner"]);
  const [tenant, subscription] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({ where: { id: session.user.tenantId } }),
    prisma.tenantSubscription.findUnique({
      where: { tenantId: session.user.tenantId },
      include: { plan: true },
    }),
  ]);
  return {
    pharmacyName: tenant.pharmacyName,
    logoUrl: tenant.logoUrl,
    primaryColor: tenant.primaryColor,
    invoiceFooterText: tenant.invoiceFooterText,
    customDomain: tenant.customDomain,
    customDomainVerificationToken: tenant.customDomainVerificationToken,
    customDomainVerifiedAt: tenant.customDomainVerifiedAt,
    whiteLabelPlan: subscription?.plan.whiteLabel ?? false,
    portalSlug: tenant.portalSlug,
  };
}

const brandingSchema = z.object({
  logoUrl: z.string().trim().url("Enter a valid URL").optional().or(z.literal("")),
  primaryColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #1e3a8a")
    .optional()
    .or(z.literal("")),
  invoiceFooterText: z.string().trim().max(300).optional().or(z.literal("")),
});

export async function updateBranding(input: z.infer<typeof brandingSchema>) {
  const session = await requireRole(["owner"]);
  const parsed = brandingSchema.parse(input);
  await prisma.tenant.update({
    where: { id: session.user.tenantId },
    data: {
      logoUrl: parsed.logoUrl || null,
      primaryColor: parsed.primaryColor || null,
      invoiceFooterText: parsed.invoiceFooterText || null,
    },
  });
  revalidatePath("/settings");
  revalidatePath("/dashboard");
}

/** Custom domains are premium/enterprise-only — gated here (settings
 * action layer), not at the DB level, so a plan downgrade doesn't silently
 * wipe a tenant's saved domain; it just stops them from re-verifying or
 * (in a full deployment) stops the reverse proxy from routing it. */
async function requireWhiteLabelPlan(tenantId: string) {
  const subscription = await prisma.tenantSubscription.findUnique({
    where: { tenantId },
    include: { plan: true },
  });
  if (!subscription?.plan.whiteLabel) {
    throw new Error("Custom domains require the Premium plan or above. Upgrade in Settings > Billing.");
  }
}

export async function setCustomDomain(domain: string) {
  const session = await requireRole(["owner"]);
  await requireWhiteLabelPlan(session.user.tenantId);

  const cleaned = domain.trim().toLowerCase();
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(cleaned)) {
    throw new Error("Enter a valid domain, e.g. billing.yourpharmacy.com");
  }

  const token = crypto.randomBytes(16).toString("hex");
  await prisma.tenant.update({
    where: { id: session.user.tenantId },
    data: { customDomain: cleaned, customDomainVerificationToken: token, customDomainVerifiedAt: null },
  });
  revalidatePath("/settings");
  return { domain: cleaned, verificationToken: token };
}

/** Real DNS lookup — checks for a TXT record at
 * `_pharmacy-verify.<domain>` containing the token issued by setCustomDomain.
 * Functionally complete, but genuinely verifying a domain requires the
 * tenant to actually control DNS for it, which can't be exercised in this
 * sandboxed environment beyond the lookup logic itself. */
export async function verifyCustomDomain() {
  const session = await requireRole(["owner"]);
  await requireWhiteLabelPlan(session.user.tenantId);

  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: session.user.tenantId } });
  if (!tenant.customDomain || !tenant.customDomainVerificationToken) {
    throw new Error("Set a custom domain first.");
  }

  let records: string[][];
  try {
    records = await dns.resolveTxt(`_pharmacy-verify.${tenant.customDomain}`);
  } catch {
    return { verified: false, note: "No TXT record found yet — DNS changes can take a few minutes to propagate." };
  }

  const found = records.some((chunks) => chunks.join("") === tenant.customDomainVerificationToken);
  if (!found) {
    return { verified: false, note: "TXT record found but the value doesn't match. Double-check what you pasted." };
  }

  await prisma.tenant.update({
    where: { id: session.user.tenantId },
    data: { customDomainVerifiedAt: new Date() },
  });
  revalidatePath("/settings");
  return { verified: true };
}

export async function setPortalSlug(slugInput: string) {
  const session = await requireRole(["owner"]);
  const slug = slugify(slugInput);
  if (slug.length < 3) {
    throw new Error("Portal URL must be at least 3 characters (letters, numbers, hyphens).");
  }

  const existing = await prisma.tenant.findUnique({ where: { portalSlug: slug }, select: { id: true } });
  if (existing && existing.id !== session.user.tenantId) {
    throw new Error("That portal URL is already taken — try another.");
  }

  await prisma.tenant.update({ where: { id: session.user.tenantId }, data: { portalSlug: slug } });
  revalidatePath("/settings");
  return { portalSlug: slug };
}

export async function clearCustomDomain() {
  const session = await requireRole(["owner"]);
  await prisma.tenant.update({
    where: { id: session.user.tenantId },
    data: { customDomain: null, customDomainVerificationToken: null, customDomainVerifiedAt: null },
  });
  revalidatePath("/settings");
}
