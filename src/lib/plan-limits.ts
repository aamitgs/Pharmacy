import "server-only";
import { prisma } from "@/lib/prisma";

export class PlanLimitError extends Error {
  constructor(
    message: string,
    public readonly limit: "maxBranches" | "maxUsers"
  ) {
    super(message);
    this.name = "PlanLimitError";
  }
}

/**
 * Feature-gating check, run before a tenant-facing create action that a
 * plan tier caps. Null on the plan means unlimited. A tenant with no
 * subscription row at all (shouldn't happen post-signup, but defensive)
 * is treated as unlimited rather than blocking — a missing subscription is
 * a data problem to fix, not something that should lock a pharmacy out of
 * billing.
 */
export async function checkPlanLimit(tenantId: string, limit: "maxBranches" | "maxUsers"): Promise<void> {
  const subscription = await prisma.tenantSubscription.findUnique({
    where: { tenantId },
    include: { plan: true },
  });
  if (!subscription) return;

  const cap = limit === "maxBranches" ? subscription.plan.maxBranches : subscription.plan.maxUsers;
  if (cap === null) return;

  const currentCount =
    limit === "maxBranches"
      ? await prisma.branch.count({ where: { tenantId } })
      : await prisma.user.count({ where: { tenantId } });

  if (currentCount >= cap) {
    const noun = limit === "maxBranches" ? (cap === 1 ? "branch" : "branches") : cap === 1 ? "user" : "users";
    throw new PlanLimitError(
      `Your ${subscription.plan.name} plan allows up to ${cap} ${noun}. Upgrade in Settings > Billing to add more.`,
      limit
    );
  }
}
