import "server-only";
import { prisma } from "@/lib/prisma";

/** Whether the tiered "Powered by Pharmacy Billing" line should be shown —
 * driven entirely by the tenant's current plan, never a manual toggle, so
 * it can't be turned off without actually being on a white-label plan. A
 * tenant with no subscription row (shouldn't happen) defaults to showing
 * the line — the safe default is advertising, not silently white-labeling. */
export async function shouldShowPoweredBy(tenantId: string): Promise<boolean> {
  const subscription = await prisma.tenantSubscription.findUnique({
    where: { tenantId },
    select: { plan: { select: { whiteLabel: true } } },
  });
  return !subscription?.plan.whiteLabel;
}
