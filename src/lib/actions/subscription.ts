"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { basePrisma, prisma, tenantContext } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { slugify } from "@/lib/slug";
import {
  createRazorpayCustomer,
  createRazorpaySubscription,
  isRazorpayConfigured,
} from "@/lib/razorpay/client";


/** Public — used by the pre-login /signup page, so no session is available.
 * subscription_plans carries no tenantId and has no RLS policy, so this
 * reads fine through the normal scoped client even with no tenant context. */
export async function listActivePlans() {
  const plans = await prisma.subscriptionPlan.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
  });
  return plans.map((p) => ({
    code: p.code,
    name: p.name,
    priceMonthly: Number(p.priceMonthly),
    maxBranches: p.maxBranches,
    maxUsers: p.maxUsers,
    whiteLabel: p.whiteLabel,
    publicApiAccess: p.publicApiAccess,
    contactSalesOnly: p.contactSalesOnly,
  }));
}

const signUpSchema = z.object({
  pharmacyName: z.string().trim().min(2, "Pharmacy name is required"),
  ownerName: z.string().trim().min(2, "Your name is required"),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  licensedAddress: z.string().trim().min(2, "Branch address is required"),
  // Phase 7: what unlocks Hospital Mode (Ward/Indent/Admission/IPD screens)
  // for this tenant — see the Tenant.tenantType comment in schema.prisma.
  tenantType: z.enum(["retail", "hospital"]).default("retail"),
});

export type SignUpInput = z.infer<typeof signUpSchema>;

/**
 * Creates a brand-new tenant, its first branch, and its owner user — the one
 * legitimate case for writing a Tenant row with no existing tenant context
 * (there's nothing to scope to yet). Every new tenant starts on the free
 * trial plan with no payment step, so signup itself never depends on
 * Razorpay being configured; upgrading to a paid tier is a separate,
 * post-signup action from Settings > Billing.
 */
export async function signUpTenant(input: SignUpInput) {
  const parsed = signUpSchema.parse(input);

  return basePrisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.rls_bypass', 'true', true)`;

    const existing = await tx.user.findFirst({ where: { email: parsed.email } });
    if (existing) throw new Error("An account with this email already exists.");

    const trialPlan = await tx.subscriptionPlan.findUnique({ where: { code: "trial" } });
    if (!trialPlan) throw new Error("Signup is temporarily unavailable — no trial plan configured.");

    // Portal slugs are unique platform-wide (see Tenant.portalSlug), so a
    // common pharmacy name ("Apollo Pharmacy") needs a disambiguating
    // suffix past the first taker — tried in order rather than a random
    // suffix so the common case (no collision) gets the cleanest URL.
    const slugBase = slugify(parsed.pharmacyName) || "pharmacy";
    let portalSlug = slugBase;
    for (let attempt = 1; await tx.tenant.findUnique({ where: { portalSlug }, select: { id: true } }); attempt++) {
      portalSlug = attempt < 50 ? `${slugBase}-${attempt + 1}` : `${slugBase}-${Date.now().toString(36)}`;
    }

    const tenant = await tx.tenant.create({
      data: { pharmacyName: parsed.pharmacyName, tenantType: parsed.tenantType, portalSlug },
    });
    await tx.branch.create({
      data: { tenantId: tenant.id, name: "Main Branch", licensedAddress: parsed.licensedAddress },
    });
    await tx.user.create({
      data: {
        tenantId: tenant.id,
        name: parsed.ownerName,
        email: parsed.email,
        role: "owner",
        passwordHash: await bcrypt.hash(parsed.password, 10),
      },
    });
    await tx.tenantSubscription.create({
      data: {
        tenantId: tenant.id,
        planId: trialPlan.id,
        status: "trialing",
        trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },
    });

    return { tenantId: tenant.id };
  });
}

export async function getBillingInfo() {
  const session = await requireRole(["owner"]);
  const [subscription, plans, branchCount, userCount] = await Promise.all([
    prisma.tenantSubscription.findUnique({
      where: { tenantId: session.user.tenantId },
      include: { plan: true },
    }),
    prisma.subscriptionPlan.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.branch.count({ where: { tenantId: session.user.tenantId } }),
    prisma.user.count({ where: { tenantId: session.user.tenantId } }),
  ]);

  return {
    subscription: subscription
      ? {
          planCode: subscription.plan.code,
          planName: subscription.plan.name,
          status: subscription.status,
          trialEndsAt: subscription.trialEndsAt,
          currentPeriodEnd: subscription.currentPeriodEnd,
        }
      : null,
    plans: plans.map((p) => ({
      code: p.code,
      name: p.name,
      priceMonthly: Number(p.priceMonthly),
      maxBranches: p.maxBranches,
      maxUsers: p.maxUsers,
      whiteLabel: p.whiteLabel,
      publicApiAccess: p.publicApiAccess,
      contactSalesOnly: p.contactSalesOnly,
    })),
    usage: { branchCount, userCount },
    razorpayConfigured: isRazorpayConfigured(),
  };
}

/**
 * Starts a Razorpay-hosted checkout for a paid plan upgrade. Returns a
 * subscription id for the client to open with Razorpay's Checkout.js
 * widget; the tenant's plan is only actually switched once the
 * `subscription.activated`/`subscription.charged` webhook confirms payment
 * — never optimistically here, since the user can still abandon checkout.
 */
export async function createUpgradeCheckout(planCode: string) {
  const session = await requireRole(["owner"]);

  const plan = await prisma.subscriptionPlan.findUnique({ where: { code: planCode } });
  if (!plan || !plan.active) throw new Error("Unknown plan.");
  if (plan.contactSalesOnly) throw new Error("This plan requires contacting sales — see the Enterprise tier.");
  if (!plan.razorpayPlanId) throw new Error("This plan is not yet wired to a Razorpay plan id.");

  const [tenant, owner] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({ where: { id: session.user.tenantId } }),
    prisma.user.findUniqueOrThrow({ where: { id: session.user.id } }),
  ]);

  const customerResult = await createRazorpayCustomer({
    name: tenant.pharmacyName,
    email: owner.email,
    contact: owner.phone ?? undefined,
  });
  if (!customerResult.ok) return { ok: false as const, note: customerResult.note };

  const subscriptionResult = await createRazorpaySubscription({
    razorpayPlanId: plan.razorpayPlanId,
    notes: { tenantId: tenant.id, planCode: plan.code },
  });
  if (!subscriptionResult.ok || !subscriptionResult.data) {
    return { ok: false as const, note: subscriptionResult.note };
  }

  await prisma.tenantSubscription.update({
    where: { tenantId: tenant.id },
    data: {
      razorpayCustomerId: customerResult.data?.id,
      razorpaySubscriptionId: subscriptionResult.data.id,
    },
  });

  return { ok: true as const, razorpaySubscriptionId: subscriptionResult.data.id };
}

/**
 * Applies a webhook-confirmed status change. Called only from the
 * signature-verified /api/webhooks/razorpay route — never from
 * tenant-facing code — so it runs with an explicit tenant override rather
 * than a session (there is no session in a webhook request).
 */
export async function applySubscriptionWebhookUpdate(params: {
  razorpaySubscriptionId: string;
  status: "trialing" | "active" | "past_due" | "cancelled";
  currentPeriodEnd?: Date;
}) {
  const existing = await basePrisma.$transaction([
    basePrisma.$executeRaw`SELECT set_config('app.rls_bypass', 'true', true)`,
    basePrisma.tenantSubscription.findUnique({
      where: { razorpaySubscriptionId: params.razorpaySubscriptionId },
    }),
  ]).then(([, row]) => row);

  if (!existing) return { matched: false as const };

  await tenantContext.run({ tenantId: existing.tenantId }, async () => {
    await prisma.tenantSubscription.update({
      where: { tenantId: existing.tenantId },
      data: {
        status: params.status,
        currentPeriodEnd: params.currentPeriodEnd,
        cancelledAt: params.status === "cancelled" ? new Date() : undefined,
      },
    });
  });
  revalidatePath("/settings");
  return { matched: true as const };
}
