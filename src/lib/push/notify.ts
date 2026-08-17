import "server-only";
import { prisma } from "@/lib/prisma";
import { sendPushNotification, type PushPayload } from "@/lib/push/config";

/**
 * Fire-and-forget push to every owner device subscribed for this tenant —
 * shared by the immediate indent-approval nudge (src/lib/actions/indents.ts)
 * and could be reused by any other real-time owner-facing event later.
 * Callers must swallow/log rejections themselves; this never throws for a
 * missing/unconfigured push setup, only for a genuine DB error.
 */
export async function notifyOwnersPush(tenantId: string, payload: PushPayload): Promise<void> {
  const owners = await prisma.user.findMany({
    where: { tenantId, role: "owner" },
    include: { pushSubscriptions: true },
  });
  for (const owner of owners) {
    for (const sub of owner.pushSubscriptions) {
      const result = await sendPushNotification(sub, payload);
      if (!result.success && result.expired) {
        await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
      }
    }
  }
}
