import "server-only";
import crypto from "node:crypto";

// Provider: Razorpay (https://razorpay.com/docs/api/) — chosen for its India-
// first recurring billing support (UPI autopay, local card networks) and a
// REST API simple enough not to need their SDK. To go live: create a
// Razorpay account, provision one Razorpay Plan per priced
// SubscriptionPlan tier (dashboard or POST /v1/plans) and store the
// returned plan id on SubscriptionPlan.razorpayPlanId, then set
// RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, and RAZORPAY_WEBHOOK_SECRET (see
// README). Without those env vars every function here returns
// { ok: false, note: "not configured" } — callers must treat that as a
// normal, expected outcome (checkout is simply unavailable), not a crash.

const RAZORPAY_API_BASE = "https://api.razorpay.com/v1";

export interface RazorpayResult<T> {
  ok: boolean;
  data?: T;
  note?: string;
}

function credentials(): { keyId: string; keySecret: string } | null {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return null;
  return { keyId, keySecret };
}

export function isRazorpayConfigured(): boolean {
  return credentials() !== null;
}

async function razorpayRequest<T>(path: string, init: RequestInit): Promise<RazorpayResult<T>> {
  const creds = credentials();
  if (!creds) {
    return { ok: false, note: "Razorpay is not configured — set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to enable subscription checkout." };
  }
  try {
    const auth = Buffer.from(`${creds.keyId}:${creds.keySecret}`).toString("base64");
    const res = await fetch(`${RAZORPAY_API_BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
        ...init.headers,
      },
      signal: AbortSignal.timeout(15000),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const message = body?.error?.description ?? `Razorpay API error ${res.status}`;
      return { ok: false, note: message };
    }
    return { ok: true, data: body as T };
  } catch (e) {
    return { ok: false, note: e instanceof Error ? `Razorpay request failed: ${e.message}` : "Razorpay request failed" };
  }
}

export interface RazorpayCustomer {
  id: string;
  email: string;
}

/** Razorpay dedupes customers by email+contact and returns a 400 on repeat
 * creation — this treats that as success and reports the existing customer
 * isn't retrievable without a search call, so callers should persist the
 * returned id on first success rather than relying on re-creation. */
export async function createRazorpayCustomer(params: {
  name: string;
  email: string;
  contact?: string;
}): Promise<RazorpayResult<RazorpayCustomer>> {
  return razorpayRequest<RazorpayCustomer>("/customers", {
    method: "POST",
    body: JSON.stringify({ name: params.name, email: params.email, contact: params.contact, fail_existing: 0 }),
  });
}

export interface RazorpaySubscription {
  id: string;
  status: string;
  short_url?: string;
}

export async function createRazorpaySubscription(params: {
  razorpayPlanId: string;
  customerNotify?: boolean;
  totalCount?: number;
  notes?: Record<string, string>;
}): Promise<RazorpayResult<RazorpaySubscription>> {
  return razorpayRequest<RazorpaySubscription>("/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      plan_id: params.razorpayPlanId,
      customer_notify: params.customerNotify ?? 1,
      // Monthly plan billed indefinitely until cancelled — Razorpay requires
      // total_count for subscriptions; a large count approximates "no end".
      total_count: params.totalCount ?? 120,
      notes: params.notes,
    }),
  });
}

export async function cancelRazorpaySubscription(subscriptionId: string): Promise<RazorpayResult<{ id: string; status: string }>> {
  return razorpayRequest(`/subscriptions/${subscriptionId}/cancel`, { method: "POST", body: JSON.stringify({}) });
}

/** Verifies the `X-Razorpay-Signature` header on an incoming webhook using
 * the raw (unparsed) request body — the HMAC is computed over the exact
 * bytes Razorpay sent, so this must run before any JSON.parse. */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signatureHeader) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  const gotBuf = Buffer.from(signatureHeader, "hex");
  if (expectedBuf.length !== gotBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, gotBuf);
}
