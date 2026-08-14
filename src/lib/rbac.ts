import "server-only";
import type { UserRole } from "@/generated/prisma/client";
import { auth } from "@/auth";

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export async function requireSession() {
  const session = await auth();
  if (!session?.user) throw new UnauthorizedError("Not signed in");
  return session;
}

/** Server-side RBAC gate. Never rely on hiding UI alone. */
export async function requireRole(allowed: UserRole[]) {
  const session = await requireSession();
  if (!allowed.includes(session.user.role)) {
    throw new UnauthorizedError(`Requires role: ${allowed.join(", ")}`);
  }
  return session;
}

// Phase 7 (Hospital Mode): ward_nurse has no business on any of the
// existing retail screens (billing, purchasing) — those predate Hospital
// Mode and were written assuming every session could reach them, so this
// is the one narrow retrofit rather than touching every action file.
// ward_pharmacist *is* included — a hospital's OPD/central pharmacist runs
// the same POS/purchasing screens a retail pharmacist does.
const RETAIL_ROLES: UserRole[] = ["owner", "pharmacist", "counter_staff", "ward_pharmacist"];

/** Same as requireSession, but excludes ward_nurse from retail billing/purchasing screens — server-side, not just a hidden nav item. */
export async function requireRetailSession() {
  const session = await requireSession();
  if (!RETAIL_ROLES.includes(session.user.role)) {
    throw new UnauthorizedError("This screen is not available for your role.");
  }
  return session;
}

// ward_pharmacist is treated identically to pharmacist everywhere below —
// a hospital's central/OPD pharmacist, not a separate permission set (see
// the UserRole enum comment in schema.prisma).
export const canViewPurchaseRate = (role: UserRole) => role === "owner" || role === "pharmacist" || role === "ward_pharmacist";
export const canEditItemMaster = (role: UserRole) => role === "owner" || role === "pharmacist" || role === "ward_pharmacist";
export const canManageUsers = (role: UserRole) => role === "owner";
export const canCancelInvoice = (role: UserRole) => role === "owner" || role === "pharmacist" || role === "ward_pharmacist";
export const canManageCompliance = (role: UserRole) => role === "owner" || role === "pharmacist" || role === "ward_pharmacist";
