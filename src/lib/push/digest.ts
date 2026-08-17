import "server-only";
import { prisma, tenantContext } from "@/lib/prisma";
import { sendPushNotification } from "@/lib/push/config";

export interface PushDigestResult {
  lowStockCount: number;
  licenseExpiryCount: number;
  pendingIndentCount: number;
  sent: number;
  failed: number;
}

/**
 * Tenant-wide (not branch-scoped) version of the same low-stock/
 * license-expiry counts src/lib/actions/alerts.ts computes for the Alerts
 * screen — this runs outside any user session (scheduled cron), so there's
 * no "currently selected branch" to filter by; a digest push summarizes
 * the whole pharmacy regardless of which branch an owner happens to be
 * viewing when they open the app.
 */
export async function runPushDigestForTenant(tenantId: string): Promise<PushDigestResult> {
  return tenantContext.run({ tenantId }, async () => {
    const [items, tenant, branches, pendingIndentCount, owners] = await Promise.all([
      prisma.item.findMany({ where: { tenantId }, include: { batches: true } }),
      prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
      prisma.branch.findMany({ where: { tenantId } }),
      prisma.indent.count({ where: { tenantId, status: "pending" } }),
      prisma.user.findMany({
        where: { tenantId, role: "owner" },
        include: { pushSubscriptions: true },
      }),
    ]);

    const lowStockCount = items.filter(
      (item) => item.batches.reduce((sum, b) => sum + b.currentQty, 0) < item.reorderLevel
    ).length;

    const now = new Date();
    const licenseExpiryCutoff = new Date(now.getTime() + tenant.licenseExpiryWindowDays * 86400000);
    let licenseExpiryCount = 0;
    for (const branch of branches) {
      const dates = (branch.licenseExpiryDates ?? {}) as Record<string, string>;
      for (const raw of Object.values(dates)) {
        if (!raw) continue;
        const expiryDate = new Date(raw);
        if (!Number.isNaN(expiryDate.getTime()) && expiryDate <= licenseExpiryCutoff) licenseExpiryCount++;
      }
    }

    let sent = 0;
    let failed = 0;
    const parts: string[] = [];
    if (lowStockCount > 0) parts.push(`${lowStockCount} item(s) low on stock`);
    if (licenseExpiryCount > 0) parts.push(`${licenseExpiryCount} license(s) expiring soon`);
    if (pendingIndentCount > 0) parts.push(`${pendingIndentCount} indent(s) awaiting approval`);

    if (parts.length > 0) {
      const payload = {
        title: "Pharmacy needs attention",
        body: parts.join(" · "),
        url: lowStockCount > 0 || licenseExpiryCount > 0 ? "/alerts" : "/indents",
      };
      for (const owner of owners) {
        for (const sub of owner.pushSubscriptions) {
          const result = await sendPushNotification(sub, payload);
          if (result.success) sent++;
          else {
            failed++;
            if (result.expired) await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
          }
        }
      }
    }

    return { lowStockCount, licenseExpiryCount, pendingIndentCount, sent, failed };
  });
}
