"use server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/rbac";
import { LICENSE_TYPES, type LicenseType } from "@/lib/license-types";
import { getBranchFilter } from "@/lib/branch-scope";
import { COLD_CHAIN_MIN_C, COLD_CHAIN_MAX_C } from "@/lib/cold-chain";

// Phase 9: cold-chain out-of-range readings from the last 7 days — long
// enough to catch a fridge issue that hasn't been re-checked yet, short
// enough that a stale alert doesn't linger indefinitely once it's fixed
// and a new in-range reading is logged.
const COLD_CHAIN_LOOKBACK_DAYS = 7;

const LICENSE_LABELS: Record<LicenseType, string> = {
  retail: "Retail drug license",
  wholesale: "Wholesale drug license",
  narcotic: "Narcotic license",
  fssai: "FSSAI registration",
};

const LICENSE_NUMBER_FIELD: Record<LicenseType, "drugLicenseRetailNo" | "drugLicenseWholesaleNo" | "narcoticLicenseNo" | "fssaiNo"> = {
  retail: "drugLicenseRetailNo",
  wholesale: "drugLicenseWholesaleNo",
  narcotic: "narcoticLicenseNo",
  fssai: "fssaiNo",
};

// Reorder suggestions & expiry-risk flagging (Phase 8) — deliberately a
// simple, explainable statistical rule (moving-average sales velocity),
// not a model. Every number the UI shows ("sold X/week, Y days left") is
// exactly what drove the suggestion, nothing hidden.
const VELOCITY_WINDOW_DAYS = 30;
const REORDER_DAYS_THRESHOLD = 14;
// "Slow-moving" for the expiry-risk refinement, same concept as the
// Reports > Movers screen's isSlowMover, just a fixed default here rather
// than the report's user-configurable threshold — Alerts is the fast,
// no-configuration view.
const SLOW_MOVER_THRESHOLD_QTY = 5;

export async function getAlerts() {
  const session = await requireSession();
  const tenantId = session.user.tenantId;

  // Low-stock/near-expiry reflect whichever branch is currently selected
  // (or every branch, consolidated, for Owner in "all branches" view) —
  // stock physically sitting at another branch shouldn't mask a shortage
  // at the one you're actually looking at.
  const branchFilter = await getBranchFilter(tenantId, session.user.role);

  const [items, tenant, branches] = await Promise.all([
    prisma.item.findMany({
      where: { tenantId },
      include: { batches: { where: branchFilter } },
      orderBy: { name: "asc" },
    }),
    prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
    prisma.branch.findMany({ where: { tenantId } }),
  ]);

  const now = new Date();
  const nearExpiryCutoff = new Date(now.getTime() + tenant.nearExpiryWindowDays * 86400000);
  const velocityWindowStart = new Date(now.getTime() - VELOCITY_WINDOW_DAYS * 86400000);

  const lowStockEntries = items
    .map((item) => ({ item, totalQty: item.batches.reduce((sum, b) => sum + b.currentQty, 0) }))
    .filter(({ item, totalQty }) => totalQty < item.reorderLevel);

  // Sales velocity over the trailing window, per item — the one number
  // every reorder suggestion and expiry-risk flag below is derived from,
  // so the UI can always show its actual reasoning.
  const salesByItem = await prisma.salesInvoiceItem.groupBy({
    by: ["itemId"],
    where: {
      invoice: { tenantId, ...branchFilter, status: "completed", invoiceDate: { gte: velocityWindowStart, lte: now } },
    },
    _sum: { qty: true },
  });
  const soldInWindowByItem = new Map(salesByItem.map((s) => [s.itemId, s._sum.qty ?? 0]));

  const reorderSuggestions: {
    itemId: string;
    itemName: string;
    unit: string;
    currentQty: number;
    unitsPerWeek: number;
    daysOfStockRemaining: number;
    lastPurchase: { rate: number; supplierId: string; supplierName: string } | null;
  }[] = [];
  for (const item of items) {
    const totalQty = item.batches.reduce((sum, b) => sum + b.currentQty, 0);
    const qtySold = soldInWindowByItem.get(item.id) ?? 0;
    if (qtySold === 0) continue; // no recent sales — nothing to extrapolate, not a reorder suggestion
    const unitsPerWeek = qtySold / (VELOCITY_WINDOW_DAYS / 7);
    const daysOfStockRemaining = totalQty <= 0 ? 0 : totalQty / (unitsPerWeek / 7);
    if (daysOfStockRemaining > REORDER_DAYS_THRESHOLD) continue;
    reorderSuggestions.push({
      itemId: item.id,
      itemName: item.name,
      unit: item.unit,
      currentQty: totalQty,
      unitsPerWeek: Math.round(unitsPerWeek * 10) / 10,
      daysOfStockRemaining: Math.round(daysOfStockRemaining * 10) / 10,
      lastPurchase: null, // filled in below, once lastPurchaseByItem is built
    });
  }
  reorderSuggestions.sort((a, b) => a.daysOfStockRemaining - b.daysOfStockRemaining);

  const lastPurchaseItemIds = [
    ...new Set([...lowStockEntries.map(({ item }) => item.id), ...reorderSuggestions.map((r) => r.itemId)]),
  ];
  const recentGrnItems = lastPurchaseItemIds.length
    ? await prisma.grnItem.findMany({
        where: { itemId: { in: lastPurchaseItemIds }, grn: { tenantId, ...branchFilter } },
        orderBy: { grn: { receivedAt: "desc" } },
        include: { grn: { include: { supplier: true } } },
      })
    : [];

  const lastPurchaseByItem = new Map<
    string,
    { rate: number; supplierId: string; supplierName: string }
  >();
  for (const gi of recentGrnItems) {
    if (!lastPurchaseByItem.has(gi.itemId)) {
      lastPurchaseByItem.set(gi.itemId, {
        rate: Number(gi.rate),
        supplierId: gi.grn.supplierId,
        supplierName: gi.grn.supplier.name,
      });
    }
  }

  const lowStock = lowStockEntries.map(({ item, totalQty }) => ({
    itemId: item.id,
    itemName: item.name,
    unit: item.unit,
    currentQty: totalQty,
    reorderLevel: item.reorderLevel,
    lastPurchase: lastPurchaseByItem.get(item.id) ?? null,
  }));

  for (const suggestion of reorderSuggestions) {
    suggestion.lastPurchase = lastPurchaseByItem.get(suggestion.itemId) ?? null;
  }

  const nearExpiry: {
    itemId: string;
    itemName: string;
    batchId: string;
    batchNo: string;
    expiryDate: Date;
    currentQty: number;
    isExpired: boolean;
    isSlowMover: boolean;
  }[] = [];
  for (const item of items) {
    const isSlowMover = (soldInWindowByItem.get(item.id) ?? 0) < SLOW_MOVER_THRESHOLD_QTY;
    for (const batch of item.batches) {
      if (batch.currentQty > 0 && batch.expiryDate <= nearExpiryCutoff) {
        nearExpiry.push({
          itemId: item.id,
          itemName: item.name,
          batchId: batch.id,
          batchNo: batch.batchNo,
          expiryDate: batch.expiryDate,
          currentQty: batch.currentQty,
          isExpired: batch.expiryDate < now,
          isSlowMover,
        });
      }
    }
  }
  // Expiry risk (slow-moving + near-expiry, the combination that causes
  // real loss) sorts to the top within the existing list — a refinement of
  // this same alert, not a separate one, per the design direction.
  nearExpiry.sort((a, b) => {
    if (a.isSlowMover !== b.isSlowMover) return a.isSlowMover ? -1 : 1;
    return a.expiryDate.getTime() - b.expiryDate.getTime();
  });

  const licenseExpiryCutoff = new Date(now.getTime() + tenant.licenseExpiryWindowDays * 86400000);
  const licenseExpiry: {
    branchId: string;
    branchName: string;
    licenseType: LicenseType;
    label: string;
    licenseNo: string | null;
    expiryDate: Date;
    daysRemaining: number;
    severity: "expired" | "urgent" | "upcoming";
  }[] = [];
  for (const branch of branches) {
    const dates = (branch.licenseExpiryDates ?? {}) as Partial<Record<LicenseType, string>>;
    for (const type of LICENSE_TYPES) {
      const raw = dates[type];
      if (!raw) continue;
      const expiryDate = new Date(raw);
      if (Number.isNaN(expiryDate.getTime()) || expiryDate > licenseExpiryCutoff) continue;
      const daysRemaining = Math.ceil((expiryDate.getTime() - now.getTime()) / 86400000);
      licenseExpiry.push({
        branchId: branch.id,
        branchName: branch.name,
        licenseType: type,
        label: LICENSE_LABELS[type],
        licenseNo: branch[LICENSE_NUMBER_FIELD[type]],
        expiryDate,
        daysRemaining,
        severity: daysRemaining < 0 ? "expired" : daysRemaining <= 15 ? "urgent" : "upcoming",
      });
    }
  }
  licenseExpiry.sort((a, b) => a.expiryDate.getTime() - b.expiryDate.getTime());

  const coldChainSince = new Date(now.getTime() - COLD_CHAIN_LOOKBACK_DAYS * 86400000);
  const coldChainLogs = await prisma.temperatureLog.findMany({
    where: {
      tenantId,
      ...branchFilter,
      recordedAt: { gte: coldChainSince },
      OR: [{ temperatureCelsius: { lt: COLD_CHAIN_MIN_C } }, { temperatureCelsius: { gt: COLD_CHAIN_MAX_C } }],
    },
    include: { branch: { select: { name: true } } },
    orderBy: { recordedAt: "desc" },
  });
  const coldChainAlerts = coldChainLogs.map((l) => ({
    id: l.id,
    branchName: l.branch.name,
    temperatureCelsius: Number(l.temperatureCelsius),
    recordedAt: l.recordedAt,
  }));

  return {
    lowStock,
    reorderSuggestions,
    reorderDaysThreshold: REORDER_DAYS_THRESHOLD,
    velocityWindowDays: VELOCITY_WINDOW_DAYS,
    slowMoverThresholdQty: SLOW_MOVER_THRESHOLD_QTY,
    nearExpiry,
    nearExpiryWindowDays: tenant.nearExpiryWindowDays,
    licenseExpiry,
    licenseExpiryWindowDays: tenant.licenseExpiryWindowDays,
    coldChainAlerts,
    coldChainMinC: COLD_CHAIN_MIN_C,
    coldChainMaxC: COLD_CHAIN_MAX_C,
  };
}
