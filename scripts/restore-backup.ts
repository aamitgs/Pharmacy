import "dotenv/config";
import { readFile } from "node:fs/promises";
import crypto from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

/**
 * Restores one tenant from an encrypted backup produced by
 * src/lib/actions/backup.ts.
 *
 *   npx tsx scripts/restore-backup.ts <file.enc> [--force] [--dry-run]
 *
 * Reads DATABASE_URL and BACKUP_ENCRYPTION_KEY from the environment, so
 * pointing it at a different database is just a matter of overriding
 * DATABASE_URL:
 *
 *   DATABASE_URL=postgresql://.../restore_target \
 *     npx tsx scripts/restore-backup.ts backups/pharmacy-backup-....enc
 *
 * Notes:
 *  - The target database must already be migrated (`prisma migrate deploy`)
 *    and must already contain the platform-global catalogs that backups
 *    deliberately exclude — SubscriptionPlan and InteractionRule, both from
 *    `prisma/seed.ts`. TenantSubscription rows reference a SubscriptionPlan
 *    by id, so a target seeded with different plan ids will fail loudly at
 *    that table rather than silently dropping the subscription.
 *  - Everything happens in ONE transaction: either the whole tenant lands or
 *    nothing does. There is no partial-restore state to reason about.
 *  - Refuses to touch a tenant id that already exists unless --force, which
 *    deletes the existing tenant first (cascades) and re-inserts.
 */

const BACKUP_SCHEMA_VERSION = 2;

function loadKey(): Buffer {
  const raw = process.env.BACKUP_ENCRYPTION_KEY;
  if (!raw) throw new Error("BACKUP_ENCRYPTION_KEY is not configured");
  const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("BACKUP_ENCRYPTION_KEY must decode to exactly 32 bytes");
  return key;
}

function decryptBackup(payload: Buffer): string {
  const key = loadKey();
  const iv = payload.subarray(0, 12);
  const authTag = payload.subarray(12, 28);
  const ciphertext = payload.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/**
 * Insert order: parents strictly before children. Postgres checks foreign
 * keys per statement, so this is what makes a single-pass restore possible
 * without deferring constraints.
 *
 * Not hand-written — this is a topological sort of the real foreign-key
 * graph read out of information_schema, with an alphabetical tie-break for
 * determinism. Hand-ordering got several edges wrong (refill_requests ->
 * sales_invoices, discounts -> sales_invoice_items), each of which only
 * showed up as a constraint violation part-way through a restore.
 *
 * Reversed, it is also a valid delete order (children first), which is what
 * --force uses to clear an existing tenant.
 */
const RESTORE_ORDER = [
  "apiKeys",
  "backupLogs",
  "branches",
  "coupons",
  "doctors",
  "franchiseGroups",
  "gstFilingReminders",
  "insuranceProviders",
  "items",
  "loyaltyTiers",
  "schemes",
  "suppliers",
  "tenantSubscriptions",
  "users",
  "auditLogs",
  "cloudBackupConnections",
  "customers",
  "franchiseMembers",
  "purchaseOrders",
  "pushSubscriptions",
  "stockTransfers",
  "supplierLedgerEntries",
  "temperatureLogs",
  "wards",
  "batches",
  "customerLedgerEntries",
  "grns",
  "indents",
  "patientAdmissions",
  "purchaseOrderItems",
  "rateContracts",
  "refillReminders",
  "salesInvoices",
  "wardAssignments",
  "customerFeedback",
  "grnItems",
  "indentItems",
  "insuranceClaims",
  "ipdDispenses",
  "narcoticRegisterEntries",
  "purchaseReturns",
  "refillRequests",
  "salesInvoiceItems",
  "creditNotes",
  "creditNoteItems",
  "stockTransferItems",
  "whatsAppLogs",
  "discounts",
  "purchaseReturnItems",
] as const;

/** collection name in the payload -> Prisma model delegate name */
const DELEGATE: Record<string, string> = {
  branches: "branch",
  users: "user",
  loyaltyTiers: "loyaltyTier",
  suppliers: "supplier",
  doctors: "doctor",
  insuranceProviders: "insuranceProvider",
  schemes: "scheme",
  coupons: "coupon",
  franchiseGroups: "franchiseGroup",
  tenantSubscriptions: "tenantSubscription",
  apiKeys: "apiKey",
  cloudBackupConnections: "cloudBackupConnection",
  gstFilingReminders: "gstFilingReminder",
  backupLogs: "backupLog",
  items: "item",
  customers: "customer",
  wards: "ward",
  franchiseMembers: "franchiseMember",
  batches: "batch",
  wardAssignments: "wardAssignment",
  patientAdmissions: "patientAdmission",
  purchaseOrders: "purchaseOrder",
  rateContracts: "rateContract",
  refillReminders: "refillReminder",
  customerLedgerEntries: "customerLedgerEntry",
  refillRequests: "refillRequest",
  pushSubscriptions: "pushSubscription",
  temperatureLogs: "temperatureLog",
  indents: "indent",
  salesInvoices: "salesInvoice",
  grns: "grn",
  stockTransfers: "stockTransfer",
  purchaseOrderItems: "purchaseOrderItem",
  indentItems: "indentItem",
  salesInvoiceItems: "salesInvoiceItem",
  creditNotes: "creditNote",
  creditNoteItems: "creditNoteItem",
  discounts: "discount",
  grnItems: "grnItem",
  purchaseReturns: "purchaseReturn",
  stockTransferItems: "stockTransferItem",
  ipdDispenses: "ipdDispense",
  insuranceClaims: "insuranceClaim",
  narcoticRegisterEntries: "narcoticRegisterEntry",
  whatsAppLogs: "whatsAppLog",
  customerFeedback: "customerFeedback",
  auditLogs: "auditLog",
  supplierLedgerEntries: "supplierLedgerEntry",
  purchaseReturnItems: "purchaseReturnItem",
};

/**
 * How to scope a delete for each collection to a single tenant. Most tables
 * carry tenantId directly; the child tables reach it through their parent,
 * and FranchiseGroup is keyed by ownerTenantId instead.
 */
function deleteScope(key: string, tenantId: string): Record<string, unknown> {
  switch (key) {
    case "batches":
      return { item: { tenantId } };
    case "salesInvoiceItems":
      return { invoice: { tenantId } };
    case "creditNoteItems":
      return { creditNote: { tenantId } };
    case "purchaseOrderItems":
      return { purchaseOrder: { tenantId } };
    case "grnItems":
      return { grn: { tenantId } };
    case "purchaseReturnItems":
      return { purchaseReturn: { tenantId } };
    case "stockTransferItems":
      return { transfer: { tenantId } };
    case "indentItems":
      return { indent: { tenantId } };
    case "franchiseGroups":
      return { ownerTenantId: tenantId };
    default:
      return { tenantId };
  }
}

/** Dates arrive as ISO strings after the JSON round-trip; Prisma wants Date
 * objects. Decimals are fine as strings — Prisma parses them. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
function reviveDates<T>(row: T): T {
  if (row === null || typeof row !== "object") return row;
  for (const [k, v] of Object.entries(row as Record<string, unknown>)) {
    if (typeof v === "string" && ISO_DATE.test(v)) {
      (row as Record<string, unknown>)[k] = new Date(v);
    }
  }
  return row;
}

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  const force = args.includes("--force");
  const dryRun = args.includes("--dry-run");

  if (!file) {
    console.error("usage: tsx scripts/restore-backup.ts <file.enc> [--force] [--dry-run]");
    process.exit(1);
  }

  const payload = await readFile(file);
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(decryptBackup(payload));
  } catch (e) {
    console.error("Could not decrypt/parse the backup. Wrong BACKUP_ENCRYPTION_KEY, or the file is corrupt.");
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }

  const version = data.schemaVersion;
  if (version !== BACKUP_SCHEMA_VERSION) {
    console.error(
      `Backup schemaVersion is ${String(version ?? "(absent — a pre-v2 partial backup)")}, ` +
        `this restore expects ${BACKUP_SCHEMA_VERSION}. Refusing: a v1 file only carries 7 of the ` +
        `52 tables and restoring it would look like success while losing the purchase ledger, ` +
        `staff accounts, the narcotic register and the audit trail.`
    );
    process.exit(1);
  }

  const tenant = data.tenant as Record<string, unknown>;
  const tenantId = tenant.id as string;
  console.log(`Backup:    ${file}`);
  console.log(`Tenant:    ${String(tenant.pharmacyName)} (${tenantId})`);
  console.log(`Exported:  ${String(data.exportedAt)}`);

  const totalRows = RESTORE_ORDER.reduce(
    (n, key) => n + ((data[key] as unknown[] | undefined)?.length ?? 0),
    1
  );
  console.log(`Rows:      ${totalRows} across ${RESTORE_ORDER.length + 1} tables\n`);

  if (dryRun) {
    for (const key of RESTORE_ORDER) {
      const rows = (data[key] as unknown[] | undefined) ?? [];
      if (rows.length) console.log(`  ${String(rows.length).padStart(6)}  ${key}`);
    }
    console.log("\n--dry-run: nothing written.");
    return;
  }

  // Always show the target before writing — a restore pointed at the wrong
  // database is the expensive mistake this tool can make. Credentials are
  // stripped so the line is safe to paste into a ticket.
  const dbUrl = process.env.DATABASE_URL ?? "";
  console.log(`Target:    ${dbUrl.replace(/\/\/[^@]*@/, "//***@") || "(DATABASE_URL unset)"}\n`);

  const adapter = new PrismaPg({ connectionString: dbUrl });
  const prisma = new PrismaClient({ adapter });

  try {
    await prisma.$executeRaw`SELECT set_config('app.rls_bypass', 'true', false)`;

    const existing = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (existing && !force) {
      console.error(
        `Tenant ${tenantId} already exists in the target database. ` +
          `Re-run with --force to delete and replace it, or point DATABASE_URL at an empty target.`
      );
      process.exit(1);
    }

    const counts: Record<string, number> = {};

    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.rls_bypass', 'true', true)`;

        if (existing && force) {
          // Explicit child-first deletion rather than relying on
          // `tenant.delete()` to cascade: most foreign keys into branches and
          // wards are RESTRICT (sales_invoices, batches, grns, stock_transfers,
          // narcotic_register_entries, wards, indents, patient_admissions …),
          // so a cascade delete fails outright for any tenant that has real
          // data. RESTORE_ORDER is parent -> child, so reversing it is exactly
          // the child -> parent order those constraints require.
          console.log(`--force: clearing existing tenant ${tenantId}…`);
          for (const key of [...RESTORE_ORDER].reverse()) {
            const delegate = (tx as unknown as Record<string, { deleteMany: (a?: unknown) => Promise<{ count: number }> }>)[
              DELEGATE[key]
            ];
            // Every delete is explicitly scoped to this tenant. The
            // surrounding transaction runs with app.rls_bypass set, so an
            // unfiltered deleteMany({}) here would silently wipe *every*
            // tenant in the target database.
            await delegate.deleteMany({ where: deleteScope(key, tenantId) });
          }
          await tx.tenant.delete({ where: { id: tenantId } });
        }

        await tx.tenant.create({ data: reviveDates(tenant) as never });
        counts.tenant = 1;

        // SubscriptionPlan ids are per-install cuids, so the planId recorded
        // in the backup usually does not exist on a freshly seeded restore
        // target. Re-point each subscription at the target's plan with the
        // same (stable, unique) `code`.
        const planRefs = (data.subscriptionPlanRefs as { id: string; code: string }[] | undefined) ?? [];
        const planIdRemap = new Map<string, string>();
        if (planRefs.length) {
          const targetPlans = await tx.subscriptionPlan.findMany({
            where: { code: { in: planRefs.map((p) => p.code) } },
            select: { id: true, code: true },
          });
          const byCode = new Map(targetPlans.map((p) => [p.code, p.id]));
          for (const ref of planRefs) {
            const targetId = byCode.get(ref.code);
            if (!targetId) {
              throw new Error(
                `Subscription plan "${ref.code}" does not exist in the target database. ` +
                  `Seed the target's platform catalogs (npm run db:seed) before restoring.`
              );
            }
            if (targetId !== ref.id) planIdRemap.set(ref.id, targetId);
          }
          if (planIdRemap.size) {
            console.log(`Re-pointing ${planIdRemap.size} subscription plan reference(s) by code.`);
          }
        }

        for (const key of RESTORE_ORDER) {
          let rows = ((data[key] as unknown[] | undefined) ?? []).map(reviveDates);
          if (!rows.length) continue;
          if (key === "tenantSubscriptions" && planIdRemap.size) {
            rows = rows.map((r) => {
              const row = r as Record<string, unknown>;
              const mapped = planIdRemap.get(row.planId as string);
              return mapped ? { ...row, planId: mapped } : row;
            });
          }
          const delegate = (tx as unknown as Record<string, { createMany: (a: unknown) => Promise<{ count: number }> }>)[
            DELEGATE[key]
          ];
          const result = await delegate.createMany({ data: rows });
          counts[key] = result.count;
        }
      },
      { timeout: 120_000, maxWait: 20_000 }
    );

    console.log("Restored:");
    for (const [k, v] of Object.entries(counts)) console.log(`  ${String(v).padStart(6)}  ${k}`);
    console.log(`\nDone — ${Object.values(counts).reduce((a, b) => a + b, 0)} rows in one transaction.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("\nRestore FAILED — the transaction rolled back, target database is unchanged.");
  console.error(e);
  process.exit(1);
});
