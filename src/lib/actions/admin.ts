"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { basePrisma } from "@/lib/prisma";
import { createAdminSession, destroyAdminSession, requireSuperAdmin } from "@/lib/admin-auth";
import { getTenantStorageBytes } from "@/lib/observability/storage-usage";
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

// Phase 11.3: no activity in 14 days is a simple, visible churn-risk flag
// right in the list — a support/billing operator scanning this table
// shouldn't have to open every tenant to spot a going-quiet account.
const STALE_ACTIVITY_DAYS = 14;

/**
 * Phase 11.3: "last activity" is the churn-risk-at-a-glance signal this
 * list needed — the most recent AuditLog entry per tenant (that table
 * already exists purely as the compliance-facing "who did what" record;
 * this reads it, it doesn't duplicate it). One groupBy for every tenant's
 * most-recent timestamp, not a per-tenant query — this list can show up
 * to 200 rows. The staleness comparison against "now" is computed here
 * (a server action, not a component) rather than in the page component,
 * since React Compiler's purity analysis forbids calling Date.now()
 * during a component's render.
 *
 * Phase 11.4: the AuditLog groupBy below is bounded to a recent window —
 * found via code audit, not guessed — since AuditLog is the one table in
 * this schema guaranteed to grow unboundedly (every user action, every
 * tenant, forever), and this list is loaded on every admin page view. A
 * tenant with no activity in the window falls back to "No activity yet"
 * in the UI, which is still an accurate churn signal for a tenant that
 * quiet for that long.
 */
const LAST_ACTIVITY_WINDOW_DAYS = 90;

export async function listTenantsForAdmin(query?: string) {
  await requireSuperAdmin();
  const activitySince = new Date(Date.now() - LAST_ACTIVITY_WINDOW_DAYS * 86400000);
  const [tenants, lastActivity] = await Promise.all([
    withBypass((tx) =>
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
    ),
    withBypass((tx) =>
      tx.auditLog.groupBy({
        by: ["tenantId"],
        where: { createdAt: { gte: activitySince } },
        _max: { createdAt: true },
      })
    ),
  ]);
  const lastActivityByTenant = new Map(lastActivity.map((row) => [row.tenantId, row._max.createdAt]));
  const staleActivityCutoff = Date.now() - STALE_ACTIVITY_DAYS * 86400000;
  return tenants.map((t) => {
    const lastActivityAt = lastActivityByTenant.get(t.id) ?? null;
    return {
      ...t,
      lastActivityAt,
      isActivityStale: lastActivityAt !== null && lastActivityAt.getTime() < staleActivityCutoff,
    };
  });
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

/** Support/ops override for a tenant created as the wrong type — e.g. a
 * hospital that self-signed-up as retail. Self-service signup also sets
 * this directly (see signUpTenant), this is the parity path for existing
 * tenants, same as setTenantSuspended/overrideTenantPlan above. */
export async function setTenantType(tenantId: string, tenantType: "retail" | "hospital") {
  await requireSuperAdmin();
  await withBypass((tx) => tx.tenant.update({ where: { id: tenantId }, data: { tenantType } }));
  revalidatePath(`/admin/tenants/${tenantId}`);
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

/**
 * Phase 11.3: per-tenant usage metrics for the Super-Admin console's own
 * support/billing operations — operator-facing only, never surfaced to
 * the tenant itself. "Active users" reads the existing AuditLog (who
 * actually did something in the last 30 days), not a new tracking
 * mechanism; "storage used" is real on-disk bytes for that tenant's
 * prescription uploads; "API call volume" is ApiKey.requestCount, a
 * running counter incremented in src/lib/api-auth.ts on every
 * authenticated request.
 */
export async function getTenantUsageMetrics(tenantId: string) {
  await requireSuperAdmin();

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [activeUsers, invoicesToday, invoicesThisMonth, apiKeys, storageBytes] = await Promise.all([
    withBypass((tx) =>
      tx.auditLog.findMany({
        where: { tenantId, createdAt: { gte: last30Days } },
        select: { userId: true },
        distinct: ["userId"],
      })
    ),
    withBypass((tx) =>
      tx.salesInvoice.count({ where: { tenantId, status: "completed", invoiceDate: { gte: startOfToday } } })
    ),
    withBypass((tx) =>
      tx.salesInvoice.count({ where: { tenantId, status: "completed", invoiceDate: { gte: startOfMonth } } })
    ),
    withBypass((tx) =>
      tx.apiKey.findMany({ where: { tenantId }, select: { requestCount: true, lastUsedAt: true, revokedAt: true } })
    ),
    getTenantStorageBytes(tenantId),
  ]);

  return {
    activeUserCount30d: activeUsers.length,
    invoicesToday,
    invoicesThisMonth,
    storageUsedBytes: storageBytes,
    apiCallVolumeTotal: apiKeys.reduce((sum, k) => sum + k.requestCount, 0),
    apiKeysActive: apiKeys.filter((k) => !k.revokedAt).length,
    apiLastUsedAt: apiKeys.reduce<Date | null>((latest, k) => {
      if (!k.lastUsedAt) return latest;
      return !latest || k.lastUsedAt > latest ? k.lastUsedAt : latest;
    }, null),
  };
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
