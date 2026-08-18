"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import { pinRejectionReason } from "@/lib/discount-override";

/**
 * A manager's discount-override PIN — the credential a counter staffer asks
 * for when a discount exceeds the tenant's staff cap.
 *
 * Deliberately self-service: a holder sets their own PIN and nobody, owner
 * included, can set it for them. An approval is only worth recording if the
 * person named is the only one who could have given it, and an owner who
 * could mint a pharmacist's PIN would break exactly that.
 */

// Same roles as DISCOUNT_OVERRIDE_ROLES in pos.ts — the cap applies to
// counter_staff, so these are the roles that can authorise past it.
const OVERRIDE_ROLES = ["owner", "pharmacist"] as const;

export async function getOwnOverridePinStatus(): Promise<{ isSet: boolean }> {
  const session = await requireRole([...OVERRIDE_ROLES]);
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { overridePinHash: true },
  });
  return { isSet: user.overridePinHash !== null };
}

export async function setOwnOverridePin(
  pin: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireRole([...OVERRIDE_ROLES]);

  const candidate = pin.trim();
  const rejection = pinRejectionReason(candidate);
  if (rejection) return { ok: false, error: rejection };

  // A PIN already in use by another holder would make attribution a coin
  // flip — resolveOverrideApprover returns the first match, so the wrong
  // manager could be recorded as having approved a discount they never saw.
  // Checked here because it is the only place a PIN is known in the clear.
  const others = await prisma.user.findMany({
    where: {
      tenantId: session.user.tenantId,
      role: { in: [...OVERRIDE_ROLES] },
      overridePinHash: { not: null },
      id: { not: session.user.id },
    },
    select: { overridePinHash: true },
  });
  for (const other of others) {
    if (await bcrypt.compare(candidate, other.overridePinHash!)) {
      // Deliberately does not name the colleague who holds it — that would
      // tell the caller another person's PIN.
      return { ok: false, error: "That PIN is already in use. Choose a different one." };
    }
  }

  const existing = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { overridePinHash: true },
  });

  await prisma.user.update({
    where: { id: session.user.id },
    data: { overridePinHash: await bcrypt.hash(candidate, 10) },
  });

  // The PIN itself never reaches the audit log — only that it changed, which
  // is what matters when reviewing who could have approved a discount on a
  // given date.
  await writeAuditLog({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: existing.overridePinHash ? "override_pin.change" : "override_pin.set",
    entity: "User",
    entityId: session.user.id,
  });

  revalidatePath("/settings");
  return { ok: true };
}

export async function clearOwnOverridePin(): Promise<{ ok: true }> {
  const session = await requireRole([...OVERRIDE_ROLES]);

  await prisma.user.update({
    where: { id: session.user.id },
    data: { overridePinHash: null },
  });

  await writeAuditLog({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "override_pin.clear",
    entity: "User",
    entityId: session.user.id,
  });

  revalidatePath("/settings");
  return { ok: true };
}
