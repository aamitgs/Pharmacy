import "server-only";
import crypto from "node:crypto";

// Signed, stateless CSRF token for the cloud-backup OAuth round trip —
// no server-side state table needed. Same HMAC-over-JSON shape as
// src/lib/admin-auth.ts's session cookie, just short-lived (10 minutes,
// long enough for a user to click through Google/Microsoft's consent
// screen) instead of session-length.
const STATE_TTL_MS = 10 * 60 * 1000;

function secret(): string {
  const s = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not configured");
  return s;
}

export interface OAuthStatePayload {
  tenantId: string;
  userId: string;
  provider: "google_drive" | "onedrive";
}

export function signOAuthState(payload: OAuthStatePayload): string {
  const data = JSON.stringify({ ...payload, nonce: crypto.randomBytes(12).toString("hex"), ts: Date.now() });
  const sig = crypto.createHmac("sha256", secret()).update(data).digest("hex");
  return Buffer.from(JSON.stringify({ data, sig })).toString("base64url");
}

export function verifyOAuthState(state: string): OAuthStatePayload {
  let parsed: { data: string; sig: string };
  try {
    parsed = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
  } catch {
    throw new Error("Invalid OAuth state");
  }
  const expected = crypto.createHmac("sha256", secret()).update(parsed.data).digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  const gotBuf = Buffer.from(parsed.sig ?? "", "hex");
  if (expectedBuf.length !== gotBuf.length || !crypto.timingSafeEqual(expectedBuf, gotBuf)) {
    throw new Error("Invalid OAuth state signature");
  }
  const payload = JSON.parse(parsed.data) as OAuthStatePayload & { ts: number };
  if (Date.now() - payload.ts > STATE_TTL_MS) {
    throw new Error("OAuth state expired — please try connecting again");
  }
  return payload;
}
