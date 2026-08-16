"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSession } from "@/lib/rbac";
import { runRefillRemindersForTenant, type RefillReminderRunResult } from "@/lib/refill-reminders/detect";

export async function getRefillReminderSettings() {
  const session = await requireRole(["owner"]);
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: session.user.tenantId } });
  return { enabled: tenant.refillRemindersEnabled };
}

export async function setRefillRemindersEnabled(enabled: boolean) {
  const session = await requireRole(["owner"]);
  await prisma.tenant.update({
    where: { id: session.user.tenantId },
    data: { refillRemindersEnabled: enabled },
  });
  revalidatePath("/settings");
  return { enabled };
}

const optInSchema = z.object({ optIn: z.boolean() });

export async function setCustomerRefillOptIn(customerId: string, optIn: boolean) {
  const session = await requireRole(["owner", "pharmacist", "ward_pharmacist"]);
  const parsed = optInSchema.parse({ optIn });

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, tenantId: session.user.tenantId },
  });
  if (!customer) throw new Error("Customer not found");

  await prisma.customer.update({
    where: { id: customerId },
    data: { refillRemindersOptIn: parsed.optIn },
  });
  revalidatePath(`/customers/${customerId}`);
  return { optIn: parsed.optIn };
}

/** Owner-triggered on-demand run for the current tenant only — same relationship
 * to the scheduled cron route as "Backup now" has to /api/backup/scheduled. */
export async function runRefillRemindersNow(): Promise<RefillReminderRunResult> {
  const session = await requireRole(["owner"]);
  const result = await runRefillRemindersForTenant(session.user.tenantId);
  revalidatePath("/settings");
  return result;
}

export async function listRefillReminderHistory(customerId: string) {
  const session = await requireSession();
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, tenantId: session.user.tenantId },
  });
  if (!customer) throw new Error("Customer not found");

  const reminders = await prisma.refillReminder.findMany({
    where: { customerId, tenantId: session.user.tenantId },
    include: { item: { select: { name: true } } },
    orderBy: { sentAt: "desc" },
    take: 20,
  });

  return reminders.map((r) => ({
    id: r.id,
    itemName: r.item.name,
    expectedDate: r.expectedDate.toISOString(),
    status: r.status,
    sentAt: r.sentAt.toISOString(),
  }));
}
