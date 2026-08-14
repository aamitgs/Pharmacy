"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireHospitalTenant } from "@/lib/hospital-scope";
import { writeAuditLog } from "@/lib/audit";

/** Any signed-in hospital-tenant user can list wards — Ward Nurses need the
 * names/types to make sense of their own assignment, central staff need the
 * full list for indent approval and staff assignment. */
export async function listWards() {
  const { session } = await requireHospitalTenant();
  const wards = await prisma.ward.findMany({
    where: { tenantId: session.user.tenantId },
    include: { branch: { select: { name: true } } },
    orderBy: { name: "asc" },
  });
  return wards.map((w) => ({
    id: w.id,
    name: w.name,
    type: w.type,
    branchId: w.branchId,
    branchName: w.branch.name,
  }));
}

const createWardSchema = z.object({
  branchId: z.string().min(1, "Select a branch"),
  name: z.string().trim().min(1, "Ward name is required"),
  type: z.enum(["icu", "ot", "general", "pharmacy_substore"]),
});

export type CreateWardInput = z.infer<typeof createWardSchema>;

/** Setting up a ward is an ownership decision, same as opening a branch (see createBranch). */
export async function createWard(input: CreateWardInput) {
  const { session } = await requireHospitalTenant(["owner"]);
  const parsed = createWardSchema.parse(input);

  const branch = await prisma.branch.findFirst({
    where: { id: parsed.branchId, tenantId: session.user.tenantId },
  });
  if (!branch) throw new Error("Branch not found");

  const ward = await prisma.ward.create({
    data: { tenantId: session.user.tenantId, branchId: parsed.branchId, name: parsed.name, type: parsed.type },
  });

  await writeAuditLog({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "ward.create",
    entity: "Ward",
    entityId: ward.id,
    after: { name: ward.name, type: ward.type, branchId: ward.branchId },
  });

  revalidatePath("/settings");
  revalidatePath("/indents");
  revalidatePath("/admissions");
  return { id: ward.id };
}
