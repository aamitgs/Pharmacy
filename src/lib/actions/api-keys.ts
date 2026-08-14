"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { generateApiKey } from "@/lib/api-auth";
import { writeAuditLog } from "@/lib/audit";

export async function getApiAccessInfo() {
  const session = await requireRole(["owner"]);
  const [subscription, keys] = await Promise.all([
    prisma.tenantSubscription.findUnique({
      where: { tenantId: session.user.tenantId },
      include: { plan: true },
    }),
    prisma.apiKey.findMany({
      where: { tenantId: session.user.tenantId, revokedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, keyPrefix: true, lastUsedAt: true, createdAt: true },
    }),
  ]);
  return { publicApiAccess: subscription?.plan.publicApiAccess ?? false, keys };
}

const createKeySchema = z.object({ name: z.string().trim().min(1, "Name is required").max(60) });

export async function createApiKeyAction(input: { name: string }) {
  const session = await requireRole(["owner"]);
  const parsed = createKeySchema.parse(input);

  const subscription = await prisma.tenantSubscription.findUnique({
    where: { tenantId: session.user.tenantId },
    include: { plan: true },
  });
  if (!subscription?.plan.publicApiAccess) {
    throw new Error("Public API access requires the Premium plan or above. Upgrade in Settings > Billing.");
  }

  const { plaintext, hash, prefix } = generateApiKey();
  await prisma.apiKey.create({
    data: { tenantId: session.user.tenantId, name: parsed.name, keyHash: hash, keyPrefix: prefix },
  });
  await writeAuditLog({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "create",
    entity: "ApiKey",
    entityId: prefix,
  });
  revalidatePath("/settings");
  // The plaintext key is returned exactly once — it's never retrievable
  // again after this response, same as GitHub/Stripe-style API keys.
  return { plaintext };
}

export async function revokeApiKeyAction(keyId: string) {
  const session = await requireRole(["owner"]);
  await prisma.apiKey.update({
    where: { id: keyId, tenantId: session.user.tenantId },
    data: { revokedAt: new Date() },
  });
  revalidatePath("/settings");
}
