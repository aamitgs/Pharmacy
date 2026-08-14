import { AsyncLocalStorage } from "node:async_hooks";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  basePrisma: PrismaClient | undefined;
};

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

/**
 * Explicit tenant override for the handful of code paths that run outside a
 * normal NextAuth session (the scheduled backup cron, the login lookup's
 * bypass, the JWT refresh callback) — set via `tenantContext.run(...)`
 * wrapping the call directly (never `enterWith`, see below).
 *
 * NOT used as the general per-request mechanism: `enterWith()` called inside
 * an awaited helper (e.g. from a shared `requireSession()`) does not survive
 * back to the awaiting caller — the caller's post-await continuation
 * captures its async context at the moment it *calls* the helper, before
 * the helper's `enterWith` mutation happens, so the mutation is silently
 * lost once the helper returns. This is standard async/await + ALS
 * semantics, not a Next.js quirk (confirmed empirically). So the general
 * path below resolves the tenant via `auth()` fresh on every query instead,
 * which Next.js reliably memoizes per-request.
 */
export const tenantContext = new AsyncLocalStorage<{ tenantId: string }>();

/**
 * Unextended base client. Two uses:
 *  1. The small set of deliberate internal helpers (login lookup, seed
 *     script, scheduled backup, super-admin console) that need to set the
 *     `app.rls_bypass` escape hatch themselves — never import for
 *     tenant-facing action code.
 *  2. `runInTenantTransaction` below, which needs an unextended `tx` so the
 *     extension doesn't try to re-wrap each call made inside it (see that
 *     function's comment for why that matters).
 */
export const basePrisma =
  globalForPrisma.basePrisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

async function resolveTenantId(): Promise<string | undefined> {
  const explicit = tenantContext.getStore();
  if (explicit) return explicit.tenantId;
  // Dynamic import avoids a static circular dependency (auth.ts imports
  // basePrisma/tenantContext from this file for its own login lookup).
  const { auth } = await import("@/auth");
  const session = await auth();
  return session?.user?.tenantId;
}

/**
 * A Prisma Client Extension's `query.$allOperations` hook has no way to
 * access the client/transaction it's attached to (verified empirically —
 * `QueryOptionsCbArgs` carries only `model`/`operation`/`args`/`query`, and
 * naively wrapping every call — including ones already inside an
 * interactive `$transaction(async (tx) => ...)` — in its own
 * `$transaction([setConfig, query(args)])` batch silently runs that call as
 * an independent auto-committing transaction, breaking the atomicity of the
 * outer transaction: a write made this way survives even if the outer
 * transaction later throws and rolls back).
 *
 * So this extension is only safe to use for standalone (non-transactional)
 * calls, which covers the large majority of the app's ~40 action files.
 * The handful of call sites that need a real atomic multi-step transaction
 * (completeSale, createGrn, purchase returns, stock transfers) must use
 * `runInTenantTransaction` instead of `prisma.$transaction` directly.
 */
const scopedClient = basePrisma.$extends({
  name: "rls-tenant-scoping",
  query: {
    $allModels: {
      async $allOperations({ args, query }) {
        const tenantId = await resolveTenantId();
        if (!tenantId) {
          // No session and no explicit override — fail closed. RLS denies
          // all rows since app.current_tenant_id is unset.
          return query(args);
        }
        const [, result] = await basePrisma.$transaction([
          basePrisma.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`,
          query(args),
        ]);
        return result;
      },
    },
  },
});

export const prisma = (globalForPrisma.prisma ?? scopedClient) as PrismaClient;

/**
 * Runs `fn` inside a real interactive transaction (atomic — all-or-nothing),
 * with `app.current_tenant_id` set once at the start on that transaction's
 * single connection for its whole duration. Use this instead of
 * `prisma.$transaction(...)` for any multi-step write that must be atomic.
 */
export async function runInTenantTransaction<T>(
  fn: (tx: Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">) => Promise<T>
): Promise<T> {
  const tenantId = await resolveTenantId();
  if (!tenantId) throw new Error("runInTenantTransaction called with no tenant resolvable");
  return basePrisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
    return fn(tx);
  });
}

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.basePrisma = basePrisma;
}
