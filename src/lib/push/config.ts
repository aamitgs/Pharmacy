import "server-only";
import webpush from "web-push";

// Same "not configured" contract as the other optional integrations
// (src/lib/whatsapp/provider.ts, the GSP e-invoice client): a pharmacy that
// hasn't set these up gets a friendly no-op, not a crash. VAPID keys
// identify this server to push services (FCM/Mozilla push etc.) — generate
// a pair with `npx web-push generate-vapid-keys` (see README).
let configured = false;

function ensureConfigured() {
  if (configured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export function isPushConfigured(): boolean {
  return ensureConfigured();
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
}

export interface PushSubscriptionKeys {
  endpoint: string;
  p256dh: string;
  authKey: string;
}

export interface PushSendResult {
  success: boolean;
  /** true when the push service reports the subscription is gone (410/404) — caller should delete it. */
  expired?: boolean;
  note?: string;
}

export async function sendPushNotification(
  sub: PushSubscriptionKeys,
  payload: PushPayload
): Promise<PushSendResult> {
  if (!ensureConfigured()) {
    return { success: false, note: "Push notifications are not configured — set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT." };
  }
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.authKey } },
      JSON.stringify(payload)
    );
    return { success: true };
  } catch (e) {
    const statusCode = (e as { statusCode?: number }).statusCode;
    if (statusCode === 404 || statusCode === 410) {
      return { success: false, expired: true, note: "Subscription no longer valid" };
    }
    return { success: false, note: e instanceof Error ? e.message : "Send failed: unknown error" };
  }
}
