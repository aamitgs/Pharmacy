"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/rbac";

/**
 * Phase 10.5: per-user high-contrast display preference, same "durable,
 * follows the user across devices/logins" pattern as `setUserLocale`.
 */
export async function setHighContrast(enabled: boolean) {
  const session = await requireSession();
  await prisma.user.update({ where: { id: session.user.id }, data: { highContrast: enabled } });
  revalidatePath("/", "layout");
}
