"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSession } from "@/lib/rbac";

export async function listInsuranceProviders() {
  const session = await requireSession();
  return prisma.insuranceProvider.findMany({
    where: { tenantId: session.user.tenantId },
    orderBy: { name: "asc" },
  });
}

/** Active-only — feeds the POS payment-mode picker, which shouldn't offer a provider the pharmacy has stopped dealing with. */
export async function listActiveInsuranceProviders(tenantId: string) {
  return prisma.insuranceProvider.findMany({
    where: { tenantId, active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

const providerSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  tpaCode: z.string().trim().optional(),
  contactPhone: z.string().trim().optional(),
  contactEmail: z.string().trim().optional(),
});

export type InsuranceProviderInput = z.infer<typeof providerSchema>;

export async function createInsuranceProvider(input: InsuranceProviderInput) {
  const session = await requireRole(["owner", "pharmacist"]);
  const parsed = providerSchema.parse(input);

  const provider = await prisma.insuranceProvider.create({
    data: {
      tenantId: session.user.tenantId,
      name: parsed.name,
      tpaCode: parsed.tpaCode || null,
      contactPhone: parsed.contactPhone || null,
      contactEmail: parsed.contactEmail || null,
    },
  });

  revalidatePath("/insurance-providers");
  revalidatePath("/pos");
  return provider;
}

export async function setInsuranceProviderActive(id: string, active: boolean) {
  const session = await requireRole(["owner", "pharmacist"]);
  const provider = await prisma.insuranceProvider.findFirst({
    where: { id, tenantId: session.user.tenantId },
  });
  if (!provider) throw new Error("Insurance provider not found");

  await prisma.insuranceProvider.update({ where: { id }, data: { active } });
  revalidatePath("/insurance-providers");
  revalidatePath("/pos");
}
