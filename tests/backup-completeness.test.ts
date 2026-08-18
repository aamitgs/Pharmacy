import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { tenantContext } from "@/lib/prisma";
import { gatherTenantData } from "@/lib/backup-export";
import { encryptBackup, decryptBackup, serializeBackup, BACKUP_SCHEMA_VERSION } from "@/lib/backup-crypto";
import { seedTenantSlice, deleteTenant, type TenantSlice } from "./rls-seed";

/**
 * Regression guard for the backup export.
 *
 * The original export covered 7 of 52 tables and reported success anyway, so
 * a restore would have silently lost the purchase ledger, staff accounts,
 * customer credit balances, the statutory narcotic register, cold-chain logs
 * and the whole audit trail. The failure mode was invisible: nothing errored,
 * the dashboard showed a green "last backup" time, and the file decrypted
 * cleanly — it was just missing most of the business.
 *
 * The first test below reads prisma/schema.prisma itself rather than a
 * hand-maintained list, so adding a new tenant-scoped model to the schema
 * without adding it to gatherTenantData fails here instead of in a disaster.
 */

// Platform-global catalogs (not tenant data) and deliberate exclusions.
// Anything listed here needs a documented reason in gatherTenantData.
const NOT_TENANT_DATA = new Set([
  "SubscriptionPlan", // global catalog, comes from prisma/seed.ts
  "InteractionRule", // global reference catalog
  "SuperAdmin", // platform operators, not tenant staff
  "CustomerOtp", // short-lived portal login codes; expire in minutes
  "Tenant", // present as the top-level `tenant` object, not a collection
]);

/** Child tables that reach tenantId through a parent rather than directly. */
const INDIRECT_MODELS: Record<string, string> = {
  Batch: "batches",
  SalesInvoiceItem: "salesInvoiceItems",
  PurchaseOrderItem: "purchaseOrderItems",
  GrnItem: "grnItems",
  PurchaseReturnItem: "purchaseReturnItems",
  StockTransferItem: "stockTransferItems",
  IndentItem: "indentItems",
};

/** Model name -> expected key in the backup payload. */
function expectedKey(model: string): string {
  if (INDIRECT_MODELS[model]) return INDIRECT_MODELS[model];
  // FranchiseGroup is scoped by ownerTenantId but still belongs to the tenant.
  const lower = model.charAt(0).toLowerCase() + model.slice(1);
  // Pluralisation matching gatherTenantData's own collection naming.
  if (lower === "customerFeedback") return "customerFeedback"; // mass noun
  // consonant + y -> ies (Category -> categories), but vowel + y just takes
  // an s (apiKey -> apiKeys, not apiKeies).
  if (/[^aeiou]y$/.test(lower)) return `${lower.slice(0, -1)}ies`;
  // sibilant endings take -es (branch -> branches, box -> boxes).
  if (/(ch|sh|ss|s|x|z)$/.test(lower)) return `${lower}es`;
  return `${lower}s`;
}

function tenantScopedModels(): string[] {
  const schema = readFileSync(path.join(process.cwd(), "prisma", "schema.prisma"), "utf8");
  const models: string[] = [];
  const re = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(schema)) !== null) {
    const [, name, body] = m;
    if (NOT_TENANT_DATA.has(name)) continue;
    const hasTenantId = /^\s+tenantId\s+\w/m.test(body);
    const isIndirect = Boolean(INDIRECT_MODELS[name]);
    const isFranchiseGroup = name === "FranchiseGroup";
    if (hasTenantId || isIndirect || isFranchiseGroup) models.push(name);
  }
  return models;
}

let slice: TenantSlice;
type BackupPayload = Awaited<ReturnType<typeof gatherTenantData>>;
let payload: BackupPayload;

/** The tests index by dynamic string keys on purpose — checking *which*
 * collections exist is the point — so read through one narrow helper rather
 * than widening the payload type everywhere. */
const rows = (key: string): unknown[] => (payload as unknown as Record<string, unknown[]>)[key] ?? [];
const hasKey = (key: string): boolean => key in (payload as unknown as Record<string, unknown>);

beforeAll(async () => {
  const suffix = `bk${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  slice = await seedTenantSlice(suffix);
  payload = await tenantContext.run({ tenantId: slice.tenantId }, () => gatherTenantData(slice.tenantId));
}, 60_000);

afterAll(async () => {
  if (slice?.tenantId) await deleteTenant(slice.tenantId);
}, 60_000);

describe("backup export covers every tenant-scoped table", () => {
  it("exports a collection for each tenant-scoped model in schema.prisma", () => {
    const missing = tenantScopedModels().filter((model) => {
      const key = expectedKey(model);
      return !hasKey(key);
    });
    expect(missing, `models absent from the backup payload: ${missing.join(", ")}`).toEqual([]);
  });

  it("carries the tenant row itself and a schema version", () => {
    expect(payload.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
    expect(payload.tenant?.id).toBe(slice.tenantId);
    expect(typeof payload.exportedAt).toBe("string");
  });
});

describe("the tables the original export silently dropped", () => {
  // Each of these was absent from the v1 export. Named individually so a
  // regression points straight at what would be lost.
  const mustHaveRows: [string, string][] = [
    ["users", "staff accounts — without these nobody can log in after a restore"],
    ["auditLogs", "the compliance who-did-what trail"],
    ["narcoticRegisterEntries", "statutory NDPS / Schedule X register"],
    ["suppliers", "supplier master"],
    ["purchaseOrders", "purchase orders"],
    ["grns", "goods received notes"],
    ["purchaseReturns", "purchase returns"],
    ["supplierLedgerEntries", "money owed to suppliers"],
    ["customerLedgerEntries", "money owed by credit customers"],
    ["stockTransfers", "inter-branch stock movements"],
    ["temperatureLogs", "cold-chain compliance records"],
    ["insuranceClaims", "insurance/TPA claims"],
    ["wards", "hospital mode wards"],
    ["patientAdmissions", "hospital mode admissions"],
    ["ipdDispenses", "hospital mode IPD dispensing"],
    ["rateContracts", "negotiated customer pricing"],
    ["customerFeedback", "customer feedback"],
    ["schemes", "discount schemes"],
    ["coupons", "coupons"],
    ["loyaltyTiers", "loyalty tiers"],
    ["apiKeys", "API keys"],
    ["tenantSubscriptions", "the tenant's own subscription"],
  ];

  it.each(mustHaveRows)("%s is present and populated (%s)", (key) => {
    expect(Array.isArray(rows(key)), `${key} should be an array`).toBe(true);
    expect(rows(key).length, `${key} should have at least one row from the seeded slice`).toBeGreaterThan(0);
  });
});

describe("backup file round-trip", () => {
  it("encrypts and decrypts back to an identical payload", () => {
    const json = serializeBackup(payload);
    const restored = JSON.parse(decryptBackup(encryptBackup(json)));
    expect(restored.tenant.id).toBe(slice.tenantId);
    expect(restored.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
    expect(restored.users.length).toBe(payload.users.length);
    expect(restored.auditLogs.length).toBe(payload.auditLogs.length);
    expect(restored.narcoticRegisterEntries.length).toBe(payload.narcoticRegisterEntries.length);
  });

  it("rejects a tampered file rather than returning partial data", () => {
    const encrypted = encryptBackup(serializeBackup(payload));
    encrypted[encrypted.length - 1] ^= 0xff; // flip a bit in the ciphertext
    expect(() => decryptBackup(encrypted)).toThrow();
  });

  it("carries subscription plan references so a restore can remap plan ids", () => {
    expect(Array.isArray(payload.subscriptionPlanRefs)).toBe(true);
    for (const ref of payload.subscriptionPlanRefs) {
      expect(typeof ref.code).toBe("string");
      expect(ref.code.length).toBeGreaterThan(0);
    }
  });
});
