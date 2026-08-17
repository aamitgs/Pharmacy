import { NextRequest, NextResponse } from "next/server";
import { basePrisma } from "@/lib/prisma";
import { runPushDigestForTenant } from "@/lib/push/digest";

// Same shared-secret cron pattern as /api/backup/scheduled and
// /api/refill-reminders/scheduled. Iterates every tenant that has at least
// one owner push subscription — a tenant with none costs nothing to skip.
export async function POST(req: NextRequest) {
  const secret = process.env.PUSH_NOTIFICATIONS_CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "PUSH_NOTIFICATIONS_CRON_SECRET not configured" }, { status: 501 });
  }
  if (req.headers.get("x-push-notifications-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [, tenantIds] = await basePrisma.$transaction([
    basePrisma.$executeRaw`SELECT set_config('app.rls_bypass', 'true', true)`,
    basePrisma.pushSubscription.findMany({ distinct: ["tenantId"], select: { tenantId: true } }),
  ]);

  const results = [];
  for (const { tenantId } of tenantIds) {
    try {
      const result = await runPushDigestForTenant(tenantId);
      results.push({ tenantId, ...result });
    } catch {
      results.push({ tenantId, lowStockCount: 0, licenseExpiryCount: 0, pendingIndentCount: 0, sent: 0, failed: 0 });
    }
  }

  return NextResponse.json({ results });
}
