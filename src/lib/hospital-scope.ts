import "server-only";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSession, requireRole } from "@/lib/rbac";
import type { UserRole } from "@/generated/prisma/client";

/**
 * Hospital Mode's tenant-level gate (see the Tenant.tenantType comment in
 * schema.prisma). Called at the top of every hospital page and server
 * action so a retail tenant hitting the URL or the action directly gets a
 * real 404 — not merely a hidden nav item — the same "not rendered/
 * routable" bar Phase 6 held plan-gated features to (plan-limits.ts /
 * requireWhiteLabelPlan), just keyed off tenantType instead of a plan.
 */
export async function requireHospitalTenant(allowedRoles?: UserRole[]) {
  const session = allowedRoles ? await requireRole(allowedRoles) : await requireSession();
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: session.user.tenantId } });
  if (tenant.tenantType !== "hospital") notFound();
  return { session, tenant };
}

/**
 * Ward ids a Ward Nurse is allowed to see/act on. Every other role (owner,
 * pharmacist, ward_pharmacist) is unrestricted — this is specifically the
 * "a nurse assigned to ICU cannot see or act on General Ward data"
 * enforcement point, applied server-side, not just in the UI.
 */
export async function resolveNurseWardIds(tenantId: string, userId: string): Promise<string[]> {
  const assignments = await prisma.wardAssignment.findMany({
    where: { tenantId, userId },
    select: { wardId: true },
  });
  return assignments.map((a) => a.wardId);
}

/** Throws if a ward_nurse tries to act on a ward they're not assigned to. Every other role passes through unrestricted. */
export async function assertWardAccess(
  session: { user: { role: UserRole; tenantId: string; id: string } },
  wardId: string
) {
  if (session.user.role !== "ward_nurse") return;
  const wardIds = await resolveNurseWardIds(session.user.tenantId, session.user.id);
  if (!wardIds.includes(wardId)) {
    throw new Error("You are not assigned to this ward.");
  }
}
