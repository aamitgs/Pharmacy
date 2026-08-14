import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";

// A deliberately separate session mechanism from the tenant NextAuth setup
// (src/auth.ts) — per the Phase 6 spec's "separate auth" requirement for
// the Super-Admin console. Hand-rolled rather than a second NextAuth
// instance to keep the trust boundary obvious: this file is the ONLY code
// that can mint or read an admin session, and it never touches tenant
// RLS/session machinery at all.

const COOKIE_NAME = "admin_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 4; // 4 hours — a platform console, not a POS shift

function secret(): string {
  const s = process.env.ADMIN_SESSION_SECRET || process.env.AUTH_SECRET;
  if (!s) throw new Error("ADMIN_SESSION_SECRET (or AUTH_SECRET) must be set to use the admin console");
  return s;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

export async function createAdminSession(adminId: string): Promise<void> {
  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  const payload = `${adminId}.${expiresAt}`;
  const token = `${payload}.${sign(payload)}`;
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/admin",
  });
}

export async function destroyAdminSession(): Promise<void> {
  const store = await cookies();
  store.delete({ name: COOKIE_NAME, path: "/admin" });
}

export async function getAdminSession(): Promise<{ adminId: string } | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [adminId, expiresAtStr, signature] = parts;
  const payload = `${adminId}.${expiresAtStr}`;

  const expected = sign(payload);
  const expectedBuf = Buffer.from(expected);
  const gotBuf = Buffer.from(signature);
  if (expectedBuf.length !== gotBuf.length || !crypto.timingSafeEqual(expectedBuf, gotBuf)) return null;

  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;

  return { adminId };
}

export class AdminUnauthorizedError extends Error {
  constructor(message = "Admin sign-in required") {
    super(message);
    this.name = "AdminUnauthorizedError";
  }
}

export async function requireSuperAdmin(): Promise<{ adminId: string }> {
  const session = await getAdminSession();
  if (!session) throw new AdminUnauthorizedError();
  return session;
}
