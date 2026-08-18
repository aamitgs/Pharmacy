"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { generateApiKey } from "@/lib/api-auth";
import { writeAuditLog } from "@/lib/audit";
import { API_SCOPES, isApiScope, type ApiScope } from "@/lib/api-scopes";

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
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        scopes: true,
        lastUsedAt: true,
        createdAt: true,
      },
    }),
  ]);
  return {
    publicApiAccess: subscription?.plan.publicApiAccess ?? false,
    // `fullAccess` marks the keys the scopes migration backfilled with
    // everything. They still work, but an owner should reissue them narrower,
    // and the UI can only prompt for that if it can tell them apart.
    keys: keys.map((k) => ({ ...k, fullAccess: k.scopes.length === API_SCOPES.length })),
  };
}

const createKeySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  // At least one scope: a key that can call nothing is never what someone
  // meant to create, and silently issuing one wastes a support round-trip.
  scopes: z
    .array(z.string())
    .min(1, "Choose at least one thing this key may do")
    .refine((values) => values.every(isApiScope), "Unknown API scope"),
});

export async function createApiKeyAction(input: { name: string; scopes: string[] }) {
  const session = await requireRole(["owner"]);
  const parsed = createKeySchema.parse(input);

  const subscription = await prisma.tenantSubscription.findUnique({
    where: { tenantId: session.user.tenantId },
    include: { plan: true },
  });
  if (!subscription?.plan.publicApiAccess) {
    throw new Error("Public API access requires the Premium plan or above. Upgrade in Settings > Billing.");
  }

  // Deduplicated and ordered so the stored value does not depend on the
  // order checkboxes happened to be ticked in — it is compared and displayed,
  // not just carried around.
  const scopes = API_SCOPES.filter((scope) => parsed.scopes.includes(scope)) as ApiScope[];

  const { plaintext, hash, prefix } = generateApiKey();
  await prisma.apiKey.create({
    data: {
      tenantId: session.user.tenantId,
      name: parsed.name,
      keyHash: hash,
      keyPrefix: prefix,
      scopes,
    },
  });
  await writeAuditLog({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "create",
    entity: "ApiKey",
    entityId: prefix,
    // What the key can do is the part worth being able to reconstruct later
    // from the log alone, after the key itself is gone.
    after: { name: parsed.name, scopes },
  });
  revalidatePath("/settings");
  // The plaintext key is returned exactly once — it's never retrievable
  // again after this response, same as GitHub/Stripe-style API keys.
  return { plaintext };
}

export async function revokeApiKeyAction(keyId: string) {
  const session = await requireRole(["owner"]);
  const key = await prisma.apiKey.update({
    where: { id: keyId, tenantId: session.user.tenantId },
    data: { revokedAt: new Date() },
  });
  await writeAuditLog({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "revoke",
    entity: "ApiKey",
    entityId: key.keyPrefix,
    before: { name: key.name, scopes: key.scopes },
  });
  revalidatePath("/settings");
}
