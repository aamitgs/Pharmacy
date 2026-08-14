import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/razorpay/client";
import { applySubscriptionWebhookUpdate } from "@/lib/actions/subscription";

// Razorpay subscription lifecycle events this app cares about — see
// https://razorpay.com/docs/webhooks/payloads/subscriptions/
const STATUS_BY_EVENT: Record<string, "active" | "past_due" | "cancelled"> = {
  "subscription.activated": "active",
  "subscription.charged": "active",
  "subscription.halted": "past_due",
  "subscription.cancelled": "cancelled",
  "subscription.completed": "cancelled",
};

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature");

  if (!verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload = JSON.parse(rawBody);
  const event = payload.event as string;
  const status = STATUS_BY_EVENT[event];
  if (!status) {
    // Not an event this app tracks (e.g. payment.* events) — ack so Razorpay
    // stops retrying, there's nothing to apply.
    return NextResponse.json({ ok: true, ignored: event });
  }

  const subscriptionEntity = payload.payload?.subscription?.entity;
  const razorpaySubscriptionId: string | undefined = subscriptionEntity?.id;
  if (!razorpaySubscriptionId) {
    return NextResponse.json({ error: "Missing subscription id in payload" }, { status: 400 });
  }

  const currentPeriodEnd = subscriptionEntity?.current_end
    ? new Date(subscriptionEntity.current_end * 1000)
    : undefined;

  const result = await applySubscriptionWebhookUpdate({ razorpaySubscriptionId, status, currentPeriodEnd });
  if (!result.matched) {
    // Ack anyway — an unknown subscription id here means it belongs to a
    // different Razorpay account/environment, not a retry-worthy failure.
    return NextResponse.json({ ok: true, matched: false });
  }
  return NextResponse.json({ ok: true, matched: true });
}
