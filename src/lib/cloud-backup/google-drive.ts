import "server-only";

// Provider: Google Drive API v3 (https://developers.google.com/drive/api/guides/about-sdk).
// To go live: create a Google Cloud project, enable the Drive API, create an
// OAuth 2.0 Web application client, add
// `<NEXTAUTH_URL>/api/oauth/google-drive/callback` as an authorized redirect
// URI, and set GOOGLE_DRIVE_CLIENT_ID / GOOGLE_DRIVE_CLIENT_SECRET (see
// README). Without those env vars every function here returns
// { ok: false, note: "not configured" } — callers must treat that as a
// normal, expected outcome, the same pattern src/lib/razorpay/client.ts
// uses.
//
// Scope is deliberately `drive.file`, not full `drive` — this app can only
// see/write files it created itself, never browse the rest of the tenant's
// Drive.

const AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";
const SCOPE = "https://www.googleapis.com/auth/drive.file";

export interface CloudResult<T> {
  ok: boolean;
  data?: T;
  note?: string;
}

function credentials(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function isGoogleDriveConfigured(): boolean {
  return credentials() !== null;
}

function redirectUri(): string {
  const base = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/api/oauth/google-drive/callback`;
}

export function buildGoogleDriveAuthUrl(state: string): string | null {
  const creds = credentials();
  if (!creds) return null;
  const params = new URLSearchParams({
    client_id: creds.clientId,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${AUTH_BASE}?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

export interface GoogleDriveTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export async function exchangeGoogleDriveCode(code: string): Promise<CloudResult<GoogleDriveTokens>> {
  const creds = credentials();
  if (!creds) return { ok: false, note: "Google Drive is not configured." };
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        redirect_uri: redirectUri(),
        grant_type: "authorization_code",
      }),
      signal: AbortSignal.timeout(15000),
    });
    const body = (await res.json().catch(() => null)) as (TokenResponse & { error_description?: string }) | null;
    if (!res.ok || !body?.access_token || !body.refresh_token) {
      return { ok: false, note: body?.error_description ?? `Google token exchange failed (${res.status})` };
    }
    return {
      ok: true,
      data: {
        accessToken: body.access_token,
        refreshToken: body.refresh_token,
        expiresAt: new Date(Date.now() + body.expires_in * 1000),
      },
    };
  } catch (e) {
    return { ok: false, note: e instanceof Error ? `Google token exchange failed: ${e.message}` : "Google token exchange failed" };
  }
}

export async function refreshGoogleDriveToken(refreshToken: string): Promise<CloudResult<{ accessToken: string; expiresAt: Date }>> {
  const creds = credentials();
  if (!creds) return { ok: false, note: "Google Drive is not configured." };
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        grant_type: "refresh_token",
      }),
      signal: AbortSignal.timeout(15000),
    });
    const body = (await res.json().catch(() => null)) as (TokenResponse & { error_description?: string }) | null;
    if (!res.ok || !body?.access_token) {
      return { ok: false, note: body?.error_description ?? `Google token refresh failed (${res.status})` };
    }
    return { ok: true, data: { accessToken: body.access_token, expiresAt: new Date(Date.now() + body.expires_in * 1000) } };
  } catch (e) {
    return { ok: false, note: e instanceof Error ? `Google token refresh failed: ${e.message}` : "Google token refresh failed" };
  }
}

/** Multipart upload (metadata + media in one request) — fine for backup
 * files at this app's scale; Drive's resumable upload protocol isn't
 * needed below its ~5MB-ish comfort threshold. */
export async function uploadToGoogleDrive(
  accessToken: string,
  filename: string,
  content: Buffer
): Promise<CloudResult<{ fileId: string }>> {
  try {
    const boundary = `pharmacy-backup-${Date.now()}`;
    const metadata = JSON.stringify({ name: filename, parents: undefined });
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`),
      content,
      Buffer.from(`\r\n--${boundary}--`),
    ]);
    const res = await fetch(`${UPLOAD_URL}?uploadType=multipart`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
      signal: AbortSignal.timeout(30000),
    });
    const responseBody = (await res.json().catch(() => null)) as { id?: string; error?: { message?: string } } | null;
    if (!res.ok || !responseBody?.id) {
      return { ok: false, note: responseBody?.error?.message ?? `Google Drive upload failed (${res.status})` };
    }
    return { ok: true, data: { fileId: responseBody.id } };
  } catch (e) {
    return { ok: false, note: e instanceof Error ? `Google Drive upload failed: ${e.message}` : "Google Drive upload failed" };
  }
}
