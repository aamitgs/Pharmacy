"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma, runInTenantTransaction } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { checkPlanLimit } from "@/lib/plan-limits";
import { writeAuditLog } from "@/lib/audit";

const HOSPITAL_ONLY_ROLES = new Set(["ward_nurse", "ward_pharmacist"]);

/** Owner-only staff directory — the one place additional (non-owner) users
 * get created; every phase before this assumed the owner user created at
 * signup was enough, but Hospital Mode needs actual Ward Nurse / Ward
 * Pharmacist accounts to assign to wards, so this had to exist. */
export async function listStaff() {
  const session = await requireRole(["owner"]);
  const users = await prisma.user.findMany({
    where: { tenantId: session.user.tenantId },
    include: { wardAssignments: { include: { ward: { select: { name: true } } } } },
    orderBy: { createdAt: "asc" },
  });
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    wardAssignments: u.wardAssignments.map((wa) => ({ wardId: wa.wardId, wardName: wa.ward.name })),
  }));
}

const createStaffSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["owner", "pharmacist", "counter_staff", "ward_nurse", "ward_pharmacist"]),
  wardIds: z.array(z.string()).optional(),
});

export type CreateStaffInput = z.infer<typeof createStaffSchema>;

export async function createStaffUser(input: CreateStaffInput) {
  const session = await requireRole(["owner"]);
  const tenantId = session.user.tenantId;
  const parsed = createStaffSchema.parse(input);

  if (HOSPITAL_ONLY_ROLES.has(parsed.role)) {
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    if (tenant.tenantType !== "hospital") {
      throw new Error("Ward roles are only available for hospital-mode tenants.");
    }
  }

  await checkPlanLimit(tenantId, "maxUsers");

  const existing = await prisma.user.findFirst({ where: { tenantId, email: parsed.email } });
  if (existing) throw new Error("A user with this email already exists.");

  if (parsed.role === "ward_nurse" && parsed.wardIds?.length) {
    const wards = await prisma.ward.findMany({ where: { id: { in: parsed.wardIds }, tenantId } });
    if (wards.length !== parsed.wardIds.length) throw new Error("One of the selected wards was not found.");
  }

  const user = await prisma.user.create({
    data: {
      tenantId,
      name: parsed.name,
      email: parsed.email,
      role: parsed.role,
      passwordHash: await bcrypt.hash(parsed.password, 10),
      ...(parsed.role === "ward_nurse" && parsed.wardIds?.length
        ? { wardAssignments: { create: parsed.wardIds.map((wardId) => ({ tenantId, wardId })) } }
        : {}),
    },
  });

  await writeAuditLog({
    tenantId,
    userId: session.user.id,
    action: "staff.create",
    entity: "User",
    entityId: user.id,
    after: { name: user.name, email: user.email, role: user.role },
  });

  revalidatePath("/settings");
  return { id: user.id };
}

/** Replaces a Ward Nurse's ward assignment set. */
export async function updateWardAssignments(userId: string, wardIds: string[]) {
  const session = await requireRole(["owner"]);
  const tenantId = session.user.tenantId;

  const user = await prisma.user.findFirst({ where: { id: userId, tenantId } });
  if (!user) throw new Error("User not found");
  if (user.role !== "ward_nurse") throw new Error("Ward assignments only apply to the Ward Nurse role.");

  if (wardIds.length) {
    const wards = await prisma.ward.findMany({ where: { id: { in: wardIds }, tenantId } });
    if (wards.length !== wardIds.length) throw new Error("One of the selected wards was not found.");
  }

  await runInTenantTransaction(async (tx) => {
    await tx.wardAssignment.deleteMany({ where: { userId, tenantId } });
    if (wardIds.length) {
      await tx.wardAssignment.createMany({ data: wardIds.map((wardId) => ({ tenantId, userId, wardId })) });
    }
  });

  revalidatePath("/settings");
}
