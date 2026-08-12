"use server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/rbac";
import { getBackupStatus } from "@/lib/actions/backup";

export async function getDashboardData() {
  const session = await requireSession();
  const tenantId = session.user.tenantId;

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [salesToday, tenant, items, backupStatus] = await Promise.all([
    prisma.salesInvoice.aggregate({
      where: { tenantId, status: "completed", invoiceDate: { gte: startOfDay } },
      _sum: { total: true },
      _count: true,
    }),
    prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
    prisma.item.findMany({
      where: { tenantId },
      include: { batches: true },
    }),
    getBackupStatus(),
  ]);

  const now = new Date();
  const nearExpiryCutoff = new Date(now.getTime() + tenant.nearExpiryWindowDays * 86400000);

  let lowStockCount = 0;
  let nearExpiryCount = 0;
  for (const item of items) {
    const totalQty = item.batches.reduce((sum, b) => sum + b.currentQty, 0);
    if (totalQty < item.reorderLevel) lowStockCount++;
    const hasNearExpiry = item.batches.some(
      (b) => b.currentQty > 0 && b.expiryDate >= now && b.expiryDate <= nearExpiryCutoff
    );
    if (hasNearExpiry) nearExpiryCount++;
  }

  return {
    todaySalesTotal: Number(salesToday._sum.total ?? 0),
    todaySalesCount: salesToday._count,
    lowStockCount,
    nearExpiryCount,
    backupStatus,
    pharmacyName: tenant.pharmacyName,
  };
}
