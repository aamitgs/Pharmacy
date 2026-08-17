"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";

/**
 * Phase 10.4: tenant-configured GST filing reminder dates. Deliberately no
 * deadline calculation from GST rules anywhere here — the tenant types in
 * whichever date(s) matter to them (filing cadence/jurisdiction varies too
 * much to guess), per the phase spec's explicit instruction.
 */
export async function listGstFilingReminders() {
  const session = await requireRole(["owner", "pharmacist"]);
  return prisma.gstFilingReminder.findMany({
    where: { tenantId: session.user.tenantId },
    orderBy: { dueDate: "asc" },
  });
}

const createSchema = z.object({
  label: z.string().trim().min(1, "Label is required").max(100),
  dueDate: z.coerce.date(),
  leadDays: z.coerce.number().int().min(0).max(90),
});

export async function createGstFilingReminder(input: z.infer<typeof createSchema>) {
  const session = await requireRole(["owner", "pharmacist"]);
  const parsed = createSchema.parse(input);

  const created = await prisma.gstFilingReminder.create({
    data: { tenantId: session.user.tenantId, ...parsed },
  });

  revalidatePath("/settings");
  revalidatePath("/alerts");
  revalidatePath("/dashboard");
  return created;
}

export async function deleteGstFilingReminder(id: string) {
  const session = await requireRole(["owner", "pharmacist"]);
  await prisma.gstFilingReminder.delete({ where: { id, tenantId: session.user.tenantId } });

  revalidatePath("/settings");
  revalidatePath("/alerts");
  revalidatePath("/dashboard");
}
