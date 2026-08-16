import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { basePrisma, prisma, tenantContext } from "@/lib/prisma";
import { seedTenantSlice, deleteTenant, type TenantSlice } from "./rls-seed";

/**
 * DB-level cross-tenant isolation suite for Phase 6's Row-Level Security
 * layer. Every assertion here goes through the real Postgres RLS policies
 * (prisma/migrations/20260814000000_add_row_level_security) — nothing is
 * mocked. This is the second, DB-enforced layer on top of the existing
 * application-layer `WHERE tenantId = ?` filtering; these tests specifically
 * prove that even if application code forgot a tenantId filter entirely,
 * the database itself would still refuse to leak or accept cross-tenant
 * rows.
 */

let A: TenantSlice;
let B: TenantSlice;

beforeAll(async () => {
  const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  A = await seedTenantSlice(`a${suffix}`);
  B = await seedTenantSlice(`b${suffix}`);
});

afterAll(async () => {
  await deleteTenant(A.tenantId);
  await deleteTenant(B.tenantId);
});

function asTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  // Must await `fn()` *inside* the run() callback, not just return the
  // (lazy, unstarted) PrismaPromise it produces — Prisma defers the actual
  // query dispatch until `.then()` is called, and if that happens outside
  // run()'s synchronous scope (e.g. via the caller's own `await
  // asTenant(...)`), the AsyncLocalStorage context is already gone by then.
  return tenantContext.run({ tenantId }, async () => await fn());
}

type Case = {
  label: string;
  aId: () => string;
  bId: () => string;
  find: (id: string) => Promise<{ id: string } | null>;
};

// `aId`/`bId` are closures, not values — the array below is built once at
// module load (before `beforeAll` has seeded A/B), but each closure reads
// the module-scoped `A`/`B` bindings lazily, at the moment a test actually
// runs them, by which point they're populated.
const cases: Case[] = [
  { label: "Tenant", aId: () => A.tenantId, bId: () => B.tenantId, find: (id) => prisma.tenant.findUnique({ where: { id } }) },
  { label: "Branch", aId: () => A.branchId, bId: () => B.branchId, find: (id) => prisma.branch.findUnique({ where: { id } }) },
  { label: "Item", aId: () => A.itemId, bId: () => B.itemId, find: (id) => prisma.item.findUnique({ where: { id } }) },
  { label: "Customer", aId: () => A.customerId, bId: () => B.customerId, find: (id) => prisma.customer.findUnique({ where: { id } }) },
  { label: "WhatsAppLog", aId: () => A.whatsappLogId, bId: () => B.whatsappLogId, find: (id) => prisma.whatsAppLog.findUnique({ where: { id } }) },
  { label: "CustomerLedgerEntry", aId: () => A.customerLedgerEntryId, bId: () => B.customerLedgerEntryId, find: (id) => prisma.customerLedgerEntry.findUnique({ where: { id } }) },
  { label: "Scheme", aId: () => A.schemeId, bId: () => B.schemeId, find: (id) => prisma.scheme.findUnique({ where: { id } }) },
  { label: "LoyaltyTier", aId: () => A.loyaltyTierId, bId: () => B.loyaltyTierId, find: (id) => prisma.loyaltyTier.findUnique({ where: { id } }) },
  { label: "Coupon", aId: () => A.couponId, bId: () => B.couponId, find: (id) => prisma.coupon.findUnique({ where: { id } }) },
  { label: "Doctor", aId: () => A.doctorId, bId: () => B.doctorId, find: (id) => prisma.doctor.findUnique({ where: { id } }) },
  { label: "SalesInvoice", aId: () => A.invoiceId, bId: () => B.invoiceId, find: (id) => prisma.salesInvoice.findUnique({ where: { id } }) },
  { label: "Discount", aId: () => A.discountId, bId: () => B.discountId, find: (id) => prisma.discount.findUnique({ where: { id } }) },
  { label: "User", aId: () => A.userId, bId: () => B.userId, find: (id) => prisma.user.findUnique({ where: { id } }) },
  { label: "AuditLog", aId: () => A.auditLogId, bId: () => B.auditLogId, find: (id) => prisma.auditLog.findUnique({ where: { id } }) },
  { label: "BackupLog", aId: () => A.backupLogId, bId: () => B.backupLogId, find: (id) => prisma.backupLog.findUnique({ where: { id } }) },
  { label: "Supplier", aId: () => A.supplierId, bId: () => B.supplierId, find: (id) => prisma.supplier.findUnique({ where: { id } }) },
  { label: "PurchaseOrder", aId: () => A.purchaseOrderId, bId: () => B.purchaseOrderId, find: (id) => prisma.purchaseOrder.findUnique({ where: { id } }) },
  { label: "Grn", aId: () => A.grnId, bId: () => B.grnId, find: (id) => prisma.grn.findUnique({ where: { id } }) },
  { label: "PurchaseReturn", aId: () => A.purchaseReturnId, bId: () => B.purchaseReturnId, find: (id) => prisma.purchaseReturn.findUnique({ where: { id } }) },
  { label: "SupplierLedgerEntry", aId: () => A.supplierLedgerEntryId, bId: () => B.supplierLedgerEntryId, find: (id) => prisma.supplierLedgerEntry.findUnique({ where: { id } }) },
  { label: "StockTransfer", aId: () => A.stockTransferId, bId: () => B.stockTransferId, find: (id) => prisma.stockTransfer.findUnique({ where: { id } }) },
  { label: "NarcoticRegisterEntry", aId: () => A.narcoticRegisterEntryId, bId: () => B.narcoticRegisterEntryId, find: (id) => prisma.narcoticRegisterEntry.findUnique({ where: { id } }) },
  { label: "TenantSubscription", aId: () => A.tenantSubscriptionId, bId: () => B.tenantSubscriptionId, find: (id) => prisma.tenantSubscription.findUnique({ where: { id } }) },
  { label: "ApiKey", aId: () => A.apiKeyId, bId: () => B.apiKeyId, find: (id) => prisma.apiKey.findUnique({ where: { id } }) },
  { label: "CloudBackupConnection", aId: () => A.cloudBackupConnectionId, bId: () => B.cloudBackupConnectionId, find: (id) => prisma.cloudBackupConnection.findUnique({ where: { id } }) },
  { label: "RefillReminder", aId: () => A.refillReminderId, bId: () => B.refillReminderId, find: (id) => prisma.refillReminder.findUnique({ where: { id } }) },
  // Phase 7: Hospital Mode
  { label: "Ward", aId: () => A.wardId, bId: () => B.wardId, find: (id) => prisma.ward.findUnique({ where: { id } }) },
  { label: "WardAssignment", aId: () => A.wardAssignmentId, bId: () => B.wardAssignmentId, find: (id) => prisma.wardAssignment.findUnique({ where: { id } }) },
  { label: "Indent", aId: () => A.indentId, bId: () => B.indentId, find: (id) => prisma.indent.findUnique({ where: { id } }) },
  { label: "PatientAdmission", aId: () => A.patientAdmissionId, bId: () => B.patientAdmissionId, find: (id) => prisma.patientAdmission.findUnique({ where: { id } }) },
  { label: "IpdDispense", aId: () => A.ipdDispenseId, bId: () => B.ipdDispenseId, find: (id) => prisma.ipdDispense.findUnique({ where: { id } }) },
  // Indirect (no direct tenantId column — scoped via EXISTS into parent)
  { label: "Batch (indirect via Item)", aId: () => A.batchId, bId: () => B.batchId, find: (id) => prisma.batch.findUnique({ where: { id } }) },
  { label: "SalesInvoiceItem (indirect via SalesInvoice)", aId: () => A.invoiceItemId, bId: () => B.invoiceItemId, find: (id) => prisma.salesInvoiceItem.findUnique({ where: { id } }) },
  { label: "PurchaseOrderItem (indirect via PurchaseOrder)", aId: () => A.purchaseOrderItemId, bId: () => B.purchaseOrderItemId, find: (id) => prisma.purchaseOrderItem.findUnique({ where: { id } }) },
  { label: "GrnItem (indirect via Grn)", aId: () => A.grnItemId, bId: () => B.grnItemId, find: (id) => prisma.grnItem.findUnique({ where: { id } }) },
  { label: "PurchaseReturnItem (indirect via PurchaseReturn)", aId: () => A.purchaseReturnItemId, bId: () => B.purchaseReturnItemId, find: (id) => prisma.purchaseReturnItem.findUnique({ where: { id } }) },
  { label: "StockTransferItem (indirect via StockTransfer)", aId: () => A.stockTransferItemId, bId: () => B.stockTransferItemId, find: (id) => prisma.stockTransferItem.findUnique({ where: { id } }) },
  { label: "IndentItem (indirect via Indent)", aId: () => A.indentItemId, bId: () => B.indentItemId, find: (id) => prisma.indentItem.findUnique({ where: { id } }) },
];

describe("cross-tenant read isolation — every RLS-protected table", () => {
  it.each(cases)("$label: tenant A sees its own row but not tenant B's", async ({ aId, bId, find }) => {
    const own = await asTenant(A.tenantId, () => find(aId()));
    expect(own).not.toBeNull();
    const other = await asTenant(A.tenantId, () => find(bId()));
    expect(other).toBeNull();
  });

  it.each(cases)("$label: tenant B sees its own row but not tenant A's", async ({ aId, bId, find }) => {
    const own = await asTenant(B.tenantId, () => find(bId()));
    expect(own).not.toBeNull();
    const other = await asTenant(B.tenantId, () => find(aId()));
    expect(other).toBeNull();
  });
});

describe("cross-tenant findMany isolation", () => {
  it("Item.findMany only returns the calling tenant's items", async () => {
    const rows = await asTenant(A.tenantId, () => prisma.item.findMany({ where: {} }));
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(A.itemId);
    expect(ids).not.toContain(B.itemId);
  });

  it("SalesInvoice.findMany only returns the calling tenant's invoices", async () => {
    const rows = await asTenant(B.tenantId, () => prisma.salesInvoice.findMany({ where: {} }));
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(B.invoiceId);
    expect(ids).not.toContain(A.invoiceId);
  });

  it("Batch.findMany (indirect table, no filter at all) only returns the calling tenant's batches", async () => {
    const rows = await asTenant(A.tenantId, () => prisma.batch.findMany());
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(A.batchId);
    expect(ids).not.toContain(B.batchId);
  });
});

describe("cross-tenant writes are blocked at the DB level", () => {
  it("tenant A cannot UPDATE tenant B's item", async () => {
    await expect(
      asTenant(A.tenantId, () => prisma.item.update({ where: { id: B.itemId }, data: { name: "hijacked" } }))
    ).rejects.toThrow();

    // Confirm B's row is untouched.
    const untouched = await asTenant(B.tenantId, () => prisma.item.findUnique({ where: { id: B.itemId } }));
    expect(untouched?.name).not.toBe("hijacked");
  });

  it("tenant A cannot DELETE tenant B's item", async () => {
    await expect(asTenant(A.tenantId, () => prisma.item.delete({ where: { id: B.itemId } }))).rejects.toThrow();

    const stillThere = await asTenant(B.tenantId, () => prisma.item.findUnique({ where: { id: B.itemId } }));
    expect(stillThere).not.toBeNull();
  });

  it("tenant A cannot UPDATE tenant B's indirect (child) row — batch via item ownership", async () => {
    await expect(
      asTenant(A.tenantId, () => prisma.batch.update({ where: { id: B.batchId }, data: { currentQty: 0 } }))
    ).rejects.toThrow();

    const untouched = await asTenant(B.tenantId, () => prisma.batch.findUnique({ where: { id: B.batchId } }));
    expect(untouched?.currentQty).toBe(50);
  });

  it("tenant A cannot INSERT a row tagged with tenant B's tenantId (WITH CHECK)", async () => {
    await expect(
      asTenant(A.tenantId, () =>
        prisma.item.create({ data: { id: `spoofed-${Date.now()}`, tenantId: B.tenantId, name: "spoofed item" } })
      )
    ).rejects.toThrow();
  });
});

describe("fail-closed default (no tenant context at all)", () => {
  it("an unscoped call with no session and no bypass sees zero rows, even though data exists", async () => {
    const items = await basePrisma.item.findMany({ where: { id: { in: [A.itemId, B.itemId] } } });
    expect(items).toHaveLength(0);
  });

  it("this holds even though the app connects as the table-owning role (FORCE ROW LEVEL SECURITY)", async () => {
    const anyItem = await basePrisma.item.findFirst();
    expect(anyItem).toBeNull();
  });
});

describe("the bypass escape hatch itself works (positive control)", () => {
  it("app.rls_bypass=true allows reading across tenants — proves the mechanism trusted internal code relies on is not itself broken", async () => {
    const [, items] = await basePrisma.$transaction([
      basePrisma.$executeRaw`SELECT set_config('app.rls_bypass', 'true', true)`,
      basePrisma.item.findMany({ where: { id: { in: [A.itemId, B.itemId] } } }),
    ]);
    const ids = items.map((r) => r.id);
    expect(ids).toContain(A.itemId);
    expect(ids).toContain(B.itemId);
  });
});
