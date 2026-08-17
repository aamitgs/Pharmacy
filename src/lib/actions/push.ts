"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSession } from "@/lib/rbac";
import { isPushConfigured, sendPushNotification, type PushPayload } from "@/lib/push/config";

/**
 * Owner mobile PWA (Phase 9.2): push notifications are scoped to the owner
 * role, matching the phase spec's framing ("owner mobile experience") —
 * other roles don't get a subscribe UI, even though the underlying table
 * has no role check baked in at the schema level.
 */

export async function getPushPublicKey(): Promise<{ configured: boolean; publicKey: string | null }> {
  await requireSession();
  const configured = isPushConfigured();
  return { configured, publicKey: configured ? (process.env.VAPID_PUBLIC_KEY ?? null) : null };
}

export async function getPushSubscriptionStatus(): Promise<{ subscribed: boolean }> {
  const session = await requireRole(["owner"]);
  const count = await prisma.pushSubscription.count({ where: { userId: session.user.id } });
  return { subscribed: count > 0 };
}

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

export async function subscribeToPush(input: unknown): Promise<{ ok: true }> {
  const session = await requireRole(["owner"]);
  const parsed = subscribeSchema.parse(input);

  await prisma.pushSubscription.upsert({
    where: { endpoint: parsed.endpoint },
    update: { userId: session.user.id, p256dh: parsed.keys.p256dh, authKey: parsed.keys.auth },
    create: {
      tenantId: session.user.tenantId,
      userId: session.user.id,
      endpoint: parsed.endpoint,
      p256dh: parsed.keys.p256dh,
      authKey: parsed.keys.auth,
    },
  });
  return { ok: true };
}

export async function unsubscribeFromPush(endpoint: string): Promise<{ ok: true }> {
  const session = await requireRole(["owner"]);
  await prisma.pushSubscription.deleteMany({ where: { userId: session.user.id, endpoint } });
  return { ok: true };
}

/** Owner-only "send a test notification" button in Settings, to confirm the round trip actually works before relying on the scheduled digest. */
export async function sendTestPushNotification(): Promise<{ sent: number; failed: number }> {
  const session = await requireRole(["owner"]);
  const subs = await prisma.pushSubscription.findMany({ where: { userId: session.user.id } });
  const payload: PushPayload = {
    title: "Test notification",
    body: "Push notifications are working for this device.",
    url: "/dashboard",
  };
  let sent = 0;
  let failed = 0;
  for (const sub of subs) {
    const result = await sendPushNotification(sub, payload);
    if (result.success) sent++;
    else {
      failed++;
      if (result.expired) await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
    }
  }
  return { sent, failed };
}
