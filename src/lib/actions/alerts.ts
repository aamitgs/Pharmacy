"use server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/rbac";

export async function getAlerts() {
  const session = await requireSession();
  const tenantId = session.user.tenantId;

  const [items, tenant] = await Promise.all([
    prisma.item.findMany({
      where: { tenantId },
      include: { batches: true },
      orderBy: { name: "asc" },
    }),
    prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
  ]);

  const now = new Date();
  const nearExpiryCutoff = new Date(now.getTime() + tenant.nearExpiryWindowDays * 86400000);

  const lowStockEntries = items
    .map((item) => ({ item, totalQty: item.batches.reduce((sum, b) => sum + b.currentQty, 0) }))
    .filter(({ item, totalQty }) => totalQty < item.reorderLevel);

  const lowStockItemIds = lowStockEntries.map(({ item }) => item.id);
  const recentGrnItems = lowStockItemIds.length
    ? await prisma.grnItem.findMany({
        where: { itemId: { in: lowStockItemIds }, grn: { tenantId } },
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

  const nearExpiry: {
    itemId: string;
    itemName: string;
    batchId: string;
    batchNo: string;
    expiryDate: Date;
    currentQty: number;
    isExpired: boolean;
  }[] = [];
  for (const item of items) {
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
        });
      }
    }
  }
  nearExpiry.sort((a, b) => a.expiryDate.getTime() - b.expiryDate.getTime());

  return { lowStock, nearExpiry, nearExpiryWindowDays: tenant.nearExpiryWindowDays };
}
