"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/rbac";

/**
 * Phase 10.3: marks the signed-in user as having completed the guided
 * walkthrough. A one-time signal for the Owner's confidence, not an
 * enforcement mechanism — nothing else in the app checks this value.
 */
export async function completeCertification() {
  const session = await requireSession();
  await prisma.user.update({ where: { id: session.user.id }, data: { certifiedAt: new Date() } });
  revalidatePath("/", "layout");
}
