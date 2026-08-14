"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { basePrisma } from "@/lib/prisma";
import { createAdminSession, destroyAdminSession, requireSuperAdmin } from "@/lib/admin-auth";
import type { PrismaClient } from "@/generated/prisma/client";

type BypassClient = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

/** Every function below runs with the RLS bypass flag scoped to its own
 * transaction — this console is the one place in the app that's supposed
 * to see across all tenants, gated by the separate admin session instead
 * of RLS. */
async function withBypass<T>(fn: (tx: BypassClient) => Promise<T>): Promise<T> {
  return basePrisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.rls_bypass', 'true', true)`;
    return fn(tx);
  });
}

const adminLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export async function adminSignIn(input: { email: string; password: string }) {
  const parsed = adminLoginSchema.parse(input);
  const admin = await withBypass((tx) => tx.superAdmin.findUnique({ where: { email: parsed.email } }));
  if (!admin) throw new Error("Incorrect email or password.");
  const valid = await bcrypt.compare(parsed.password, admin.passwordHash);
  if (!valid) throw new Error("Incorrect email or password.");
  await createAdminSession(admin.id);
}

export async function adminSignOut() {
  await destroyAdminSession();
  redirect("/admin/login");
}

export async function listTenantsForAdmin(query?: string) {
  await requireSuperAdmin();
  return withBypass((tx) =>
    tx.tenant.findMany({
      where: query
        ? { pharmacyName: { contains: query, mode: "insensitive" } }
        : undefined,
      include: {
        subscription: { include: { plan: true } },
        _count: { select: { users: true, branches: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    })
  );
}

export async function getTenantForAdmin(tenantId: string) {
  await requireSuperAdmin();
  const [tenant, plans] = await Promise.all([
    withBypass((tx) =>
      tx.tenant.findUnique({
        where: { id: tenantId },
        include: {
          subscription: { include: { plan: true } },
          branches: { select: { id: true, name: true } },
          users: { select: { id: true, name: true, email: true, role: true } },
          _count: { select: { salesInvoices: true, items: true } },
        },
      })
    ),
    withBypass((tx) => tx.subscriptionPlan.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } })),
  ]);
  return { tenant, plans };
}

export async function setTenantSuspended(tenantId: string, suspended: boolean) {
  await requireSuperAdmin();
  await withBypass((tx) =>
    tx.tenant.update({ where: { id: tenantId }, data: { suspendedAt: suspended ? new Date() : null } })
  );
  revalidatePath(`/admin/tenants/${tenantId}`);
  revalidatePath("/admin");
}

export async function overrideTenantPlan(tenantId: string, planCode: string) {
  await requireSuperAdmin();
  await withBypass(async (tx) => {
    const plan = await tx.subscriptionPlan.findUniqueOrThrow({ where: { code: planCode } });
    await tx.tenantSubscription.update({
      where: { tenantId },
      data: { planId: plan.id, status: "active" },
    });
  });
  revalidatePath(`/admin/tenants/${tenantId}`);
}

/** Tenants past their trial with nothing converted, or with a cancelled
 * subscription — the platform's simplest churn signal. */
export async function getChurnReport() {
  await requireSuperAdmin();
  const now = new Date();
  return withBypass((tx) =>
    tx.tenantSubscription.findMany({
      where: {
        OR: [{ status: "cancelled" }, { status: "trialing", trialEndsAt: { lt: now } }],
      },
      include: { tenant: { select: { pharmacyName: true, createdAt: true } }, plan: true },
      orderBy: { updatedAt: "desc" },
    })
  );
}
