import "server-only";
import { prisma } from "@/lib/prisma";
import { BACKUP_SCHEMA_VERSION } from "@/lib/backup-crypto";

/**
 * A complete export of one tenant's data.
 *
 * Deliberately NOT exported, because they are not tenant data:
 *  - SubscriptionPlan, InteractionRule — platform-global catalogs that come
 *    from `prisma/seed.ts`; a restore target is expected to already have them.
 *  - SuperAdmin — platform operator accounts, not the tenant's.
 *  - CustomerOtp — short-lived portal login codes that expire in minutes;
 *    restoring stale ones is pointless and needlessly retains auth material.
 *
 * Everything else a tenant owns IS exported, including credentials
 * (User.passwordHash/totpSecret, ApiKey.keyHash, CloudBackupConnection's
 * encrypted OAuth tokens) — without them a restored system has nobody who
 * can log in. The whole payload is AES-256-GCM encrypted before it leaves
 * this process, so the backup file is only as strong as
 * BACKUP_ENCRYPTION_KEY. Treat that key as equivalent to the database.
 *
 * Queries run sequentially rather than in one big Promise.all: the RLS
 * extension wraps every call in its own transaction (see src/lib/prisma.ts),
 * so ~50 concurrent ones would take ~50 pool connections at once. A backup
 * is not latency-sensitive.
 *
 * Exported so cloud-backup.ts (Phase 8) and the scheduled cron route reuse
 * this exact shape instead of each keeping their own copy — an earlier
 * divergence there meant the unattended nightly backup stayed incomplete
 * even after the manual one was fixed.
 */
export async function gatherTenantData(tenantId: string) {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });

  // --- core / Phase 1 ---
  const branches = await prisma.branch.findMany({ where: { tenantId } });
  const users = await prisma.user.findMany({ where: { tenantId } });
  const items = await prisma.item.findMany({ where: { tenantId } });
  const batches = await prisma.batch.findMany({ where: { item: { tenantId } } });
  const customers = await prisma.customer.findMany({ where: { tenantId } });
  const doctors = await prisma.doctor.findMany({ where: { tenantId } });
  const salesInvoices = await prisma.salesInvoice.findMany({ where: { tenantId } });
  const salesInvoiceItems = await prisma.salesInvoiceItem.findMany({ where: { invoice: { tenantId } } });
  const discounts = await prisma.discount.findMany({ where: { tenantId } });
  const auditLogs = await prisma.auditLog.findMany({ where: { tenantId } });
  const backupLogs = await prisma.backupLog.findMany({ where: { tenantId } });

  // --- Phase 2: purchasing ---
  const suppliers = await prisma.supplier.findMany({ where: { tenantId } });
  const purchaseOrders = await prisma.purchaseOrder.findMany({ where: { tenantId } });
  const purchaseOrderItems = await prisma.purchaseOrderItem.findMany({ where: { purchaseOrder: { tenantId } } });
  const grns = await prisma.grn.findMany({ where: { tenantId } });
  const grnItems = await prisma.grnItem.findMany({ where: { grn: { tenantId } } });
  const purchaseReturns = await prisma.purchaseReturn.findMany({ where: { tenantId } });
  const purchaseReturnItems = await prisma.purchaseReturnItem.findMany({ where: { purchaseReturn: { tenantId } } });
  const supplierLedgerEntries = await prisma.supplierLedgerEntry.findMany({ where: { tenantId } });

  // --- Phase 3: compliance ---
  const narcoticRegisterEntries = await prisma.narcoticRegisterEntry.findMany({ where: { tenantId } });

  // --- Phase 4: multi-branch, offers ---
  const stockTransfers = await prisma.stockTransfer.findMany({ where: { tenantId } });
  const stockTransferItems = await prisma.stockTransferItem.findMany({ where: { transfer: { tenantId } } });
  const schemes = await prisma.scheme.findMany({ where: { tenantId } });
  const loyaltyTiers = await prisma.loyaltyTier.findMany({ where: { tenantId } });
  const coupons = await prisma.coupon.findMany({ where: { tenantId } });

  // --- Phase 5: credit, messaging ---
  const customerLedgerEntries = await prisma.customerLedgerEntry.findMany({ where: { tenantId } });
  const whatsAppLogs = await prisma.whatsAppLog.findMany({ where: { tenantId } });

  // --- Phase 6: SaaS ---
  const tenantSubscriptions = await prisma.tenantSubscription.findMany({ where: { tenantId } });
  const apiKeys = await prisma.apiKey.findMany({ where: { tenantId } });

  // --- Phase 7: hospital mode ---
  const wards = await prisma.ward.findMany({ where: { tenantId } });
  const wardAssignments = await prisma.wardAssignment.findMany({ where: { tenantId } });
  const indents = await prisma.indent.findMany({ where: { tenantId } });
  const indentItems = await prisma.indentItem.findMany({ where: { indent: { tenantId } } });
  const patientAdmissions = await prisma.patientAdmission.findMany({ where: { tenantId } });
  const ipdDispenses = await prisma.ipdDispense.findMany({ where: { tenantId } });

  // --- Phase 8: cloud backup, reminders, insurance ---
  const cloudBackupConnections = await prisma.cloudBackupConnection.findMany({ where: { tenantId } });
  const refillReminders = await prisma.refillReminder.findMany({ where: { tenantId } });
  const insuranceProviders = await prisma.insuranceProvider.findMany({ where: { tenantId } });
  const insuranceClaims = await prisma.insuranceClaim.findMany({ where: { tenantId } });

  // --- Phase 9: portal, PWA, contracts, cold chain, feedback, franchise ---
  const refillRequests = await prisma.refillRequest.findMany({ where: { tenantId } });
  const pushSubscriptions = await prisma.pushSubscription.findMany({ where: { tenantId } });
  const rateContracts = await prisma.rateContract.findMany({ where: { tenantId } });
  const temperatureLogs = await prisma.temperatureLog.findMany({ where: { tenantId } });
  const customerFeedback = await prisma.customerFeedback.findMany({ where: { tenantId } });
  // FranchiseGroup is scoped by ownerTenantId, not tenantId — only the
  // franchisor's own backup carries the group; members carry their membership.
  const franchiseGroups = await prisma.franchiseGroup.findMany({ where: { ownerTenantId: tenantId } });
  const franchiseMembers = await prisma.franchiseMember.findMany({ where: { tenantId } });

  // --- Phase 10: compliance nudges ---
  const gstFilingReminders = await prisma.gstFilingReminder.findMany({ where: { tenantId } });

  // Not tenant data, and deliberately not restored — just enough of the
  // referenced SubscriptionPlan rows to re-point TenantSubscription.planId
  // on the way in. Plan ids are cuids generated per-install, so a restore
  // onto a freshly seeded target would otherwise fail on the planId foreign
  // key; `code` is the stable, unique identity to match on instead.
  const subscriptionPlanRefs = await prisma.subscriptionPlan.findMany({
    where: { id: { in: tenantSubscriptions.map((s) => s.planId) } },
    select: { id: true, code: true },
  });

  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    tenant,
    branches,
    users,
    items,
    batches,
    customers,
    doctors,
    salesInvoices,
    salesInvoiceItems,
    discounts,
    auditLogs,
    backupLogs,
    suppliers,
    purchaseOrders,
    purchaseOrderItems,
    grns,
    grnItems,
    purchaseReturns,
    purchaseReturnItems,
    supplierLedgerEntries,
    narcoticRegisterEntries,
    stockTransfers,
    stockTransferItems,
    schemes,
    loyaltyTiers,
    coupons,
    customerLedgerEntries,
    whatsAppLogs,
    tenantSubscriptions,
    apiKeys,
    wards,
    wardAssignments,
    indents,
    indentItems,
    patientAdmissions,
    ipdDispenses,
    cloudBackupConnections,
    refillReminders,
    insuranceProviders,
    insuranceClaims,
    refillRequests,
    pushSubscriptions,
    rateContracts,
    temperatureLogs,
    customerFeedback,
    franchiseGroups,
    franchiseMembers,
    gstFilingReminders,
    subscriptionPlanRefs,
  };
}
