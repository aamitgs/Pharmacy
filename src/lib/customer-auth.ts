import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";

// A deliberately separate session mechanism from both the tenant NextAuth
// setup (src/auth.ts) and the Super-Admin console's session (src/lib/
// admin-auth.ts, the pattern this file mirrors) — customers must never
// share the staff login system per the Phase 9 spec. Hand-rolled, signed,
// httpOnly cookie rather than a second NextAuth instance, same reasoning
// admin-auth.ts already documents: this file is the ONLY code that can
// mint or read a customer-portal session.

const COOKIE_PREFIX = "portal_session_";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days — a customer checking their history occasionally, not a POS shift

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET must be set to use the customer portal");
  return s;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

// One cookie per tenant slug (path-scoped to /portal/<slug>) so a customer
// who happens to be a customer of two different pharmacies on this
// platform can hold two independent portal sessions in the same browser
// without them colliding or leaking into each other's path scope.
function cookieName(slug: string): string {
  return `${COOKIE_PREFIX}${slug}`;
}

export interface CustomerSession {
  tenantId: string;
  customerId: string;
}

export async function createCustomerSession(slug: string, session: CustomerSession): Promise<void> {
  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  const payload = `${session.tenantId}.${session.customerId}.${expiresAt}`;
  const token = `${payload}.${sign(payload)}`;
  const store = await cookies();
  store.set(cookieName(slug), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: `/portal/${slug}`,
  });
}

export async function destroyCustomerSession(slug: string): Promise<void> {
  const store = await cookies();
  store.delete({ name: cookieName(slug), path: `/portal/${slug}` });
}

export async function getCustomerSession(slug: string): Promise<CustomerSession | null> {
  const store = await cookies();
  const token = store.get(cookieName(slug))?.value;
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [tenantId, customerId, expiresAtStr, signature] = parts;
  const payload = `${tenantId}.${customerId}.${expiresAtStr}`;

  const expected = sign(payload);
  const expectedBuf = Buffer.from(expected);
  const gotBuf = Buffer.from(signature);
  if (expectedBuf.length !== gotBuf.length || !crypto.timingSafeEqual(expectedBuf, gotBuf)) return null;

  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;

  return { tenantId, customerId };
}

export class CustomerUnauthorizedError extends Error {
  constructor(message = "Portal sign-in required") {
    super(message);
    this.name = "CustomerUnauthorizedError";
  }
}

export async function requireCustomerSession(slug: string): Promise<CustomerSession> {
  const session = await getCustomerSession(slug);
  if (!session) throw new CustomerUnauthorizedError();
  return session;
}
