import "server-only";
import type { CloudResult } from "./google-drive";

// Provider: Microsoft Graph API (OneDrive) —
// https://learn.microsoft.com/en-us/onedrive/developer/rest-api/. To go
// live: register an app in the Azure/Microsoft Entra portal, add
// `<NEXTAUTH_URL>/api/oauth/onedrive/callback` as a redirect URI, and set
// ONEDRIVE_CLIENT_ID / ONEDRIVE_CLIENT_SECRET (see README). Without those
// env vars every function here returns { ok: false, note: "not configured" },
// same pattern as google-drive.ts. Uses the "common" authority so both
// personal Microsoft accounts and work/school OneDrive both work.

const AUTH_BASE = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const SCOPE = "Files.ReadWrite offline_access";

function credentials(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.ONEDRIVE_CLIENT_ID;
  const clientSecret = process.env.ONEDRIVE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function isOneDriveConfigured(): boolean {
  return credentials() !== null;
}

function redirectUri(): string {
  const base = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/api/oauth/onedrive/callback`;
}

export function buildOneDriveAuthUrl(state: string): string | null {
  const creds = credentials();
  if (!creds) return null;
  const params = new URLSearchParams({
    client_id: creds.clientId,
    redirect_uri: redirectUri(),
    response_type: "code",
    response_mode: "query",
    scope: SCOPE,
    state,
  });
  return `${AUTH_BASE}?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

export interface OneDriveTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export async function exchangeOneDriveCode(code: string): Promise<CloudResult<OneDriveTokens>> {
  const creds = credentials();
  if (!creds) return { ok: false, note: "OneDrive is not configured." };
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
        scope: SCOPE,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const body = (await res.json().catch(() => null)) as (TokenResponse & { error_description?: string }) | null;
    if (!res.ok || !body?.access_token || !body.refresh_token) {
      return { ok: false, note: body?.error_description ?? `Microsoft token exchange failed (${res.status})` };
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
    return { ok: false, note: e instanceof Error ? `Microsoft token exchange failed: ${e.message}` : "Microsoft token exchange failed" };
  }
}

export async function refreshOneDriveToken(refreshToken: string): Promise<CloudResult<{ accessToken: string; expiresAt: Date }>> {
  const creds = credentials();
  if (!creds) return { ok: false, note: "OneDrive is not configured." };
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        grant_type: "refresh_token",
        scope: SCOPE,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const body = (await res.json().catch(() => null)) as (TokenResponse & { error_description?: string }) | null;
    if (!res.ok || !body?.access_token) {
      return { ok: false, note: body?.error_description ?? `Microsoft token refresh failed (${res.status})` };
    }
    return { ok: true, data: { accessToken: body.access_token, expiresAt: new Date(Date.now() + body.expires_in * 1000) } };
  } catch (e) {
    return { ok: false, note: e instanceof Error ? `Microsoft token refresh failed: ${e.message}` : "Microsoft token refresh failed" };
  }
}

/** Simple PUT upload into a dedicated app folder — fine for backup files at
 * this app's scale; Graph's resumable upload session isn't needed below
 * its 4MB simple-upload ceiling for typical tenant data sizes. */
export async function uploadToOneDrive(accessToken: string, filename: string, content: Buffer): Promise<CloudResult<{ itemId: string }>> {
  try {
    const res = await fetch(`${GRAPH_BASE}/me/drive/root:/PharmacyBackups/${encodeURIComponent(filename)}:/content`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/octet-stream",
      },
      body: new Uint8Array(content),
      signal: AbortSignal.timeout(30000),
    });
    const responseBody = (await res.json().catch(() => null)) as { id?: string; error?: { message?: string } } | null;
    if (!res.ok || !responseBody?.id) {
      return { ok: false, note: responseBody?.error?.message ?? `OneDrive upload failed (${res.status})` };
    }
    return { ok: true, data: { itemId: responseBody.id } };
  } catch (e) {
    return { ok: false, note: e instanceof Error ? `OneDrive upload failed: ${e.message}` : "OneDrive upload failed" };
  }
}
