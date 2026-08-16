import { NextRequest, NextResponse } from "next/server";
import { basePrisma } from "@/lib/prisma";
import { runRefillRemindersForTenant } from "@/lib/refill-reminders/detect";

// Intended to be hit by an OS-level cron / scheduler (see README), not by a
// logged-in user — auth is a shared secret header, the same pattern as
// /api/backup/scheduled. Iterates every tenant with refillRemindersEnabled
// on; runRefillRemindersForTenant itself is the no-op for everyone else
// (checked again inside, so this filter is just an optimization to skip
// the detection query for tenants that never opted in).
export async function POST(req: NextRequest) {
  const secret = process.env.REFILL_REMINDERS_CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "REFILL_REMINDERS_CRON_SECRET not configured" }, { status: 501 });
  }
  if (req.headers.get("x-refill-reminders-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [, tenants] = await basePrisma.$transaction([
    basePrisma.$executeRaw`SELECT set_config('app.rls_bypass', 'true', true)`,
    basePrisma.tenant.findMany({ where: { refillRemindersEnabled: true }, select: { id: true } }),
  ]);

  const results: { tenantId: string; sent: number; failed: number; checked: number }[] = [];
  for (const { id: tenantId } of tenants) {
    try {
      const result = await runRefillRemindersForTenant(tenantId);
      results.push({ tenantId, ...result });
    } catch {
      results.push({ tenantId, sent: 0, failed: 0, checked: 0 });
    }
  }

  return NextResponse.json({ results });
}
