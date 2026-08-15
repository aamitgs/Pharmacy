import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { encryptBackup } from "@/lib/backup-crypto";
import { verifyOAuthState } from "@/lib/cloud-backup/oauth-state";
import { exchangeGoogleDriveCode } from "@/lib/cloud-backup/google-drive";

/** Google redirects the user's own browser back here after consent — the
 * tenant session cookie is already present (same browser), so this is
 * gated by the normal session, plus the signed `state` as CSRF/tamper
 * protection and a cross-check that it was issued to this same
 * tenant/user. */
export async function GET(req: NextRequest) {
  const settingsUrl = new URL("/settings", req.nextUrl.origin);
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  if (error) {
    settingsUrl.searchParams.set("cloudBackupError", error);
    return NextResponse.redirect(settingsUrl);
  }
  if (!code || !state) {
    settingsUrl.searchParams.set("cloudBackupError", "missing_code_or_state");
    return NextResponse.redirect(settingsUrl);
  }

  try {
    const payload = verifyOAuthState(state);
    if (payload.provider !== "google_drive") throw new Error("Provider mismatch");

    const session = await auth();
    if (!session?.user || session.user.tenantId !== payload.tenantId || session.user.id !== payload.userId) {
      throw new Error("Session mismatch — please try connecting again from Settings.");
    }

    const result = await exchangeGoogleDriveCode(code);
    if (!result.ok || !result.data) throw new Error(result.note ?? "Token exchange failed");

    await prisma.cloudBackupConnection.upsert({
      where: { tenantId_provider: { tenantId: payload.tenantId, provider: "google_drive" } },
      create: {
        tenantId: payload.tenantId,
        provider: "google_drive",
        accessTokenEnc: encryptBackup(result.data.accessToken).toString("base64"),
        refreshTokenEnc: encryptBackup(result.data.refreshToken).toString("base64"),
        expiresAt: result.data.expiresAt,
        connectedByUserId: payload.userId,
      },
      update: {
        accessTokenEnc: encryptBackup(result.data.accessToken).toString("base64"),
        refreshTokenEnc: encryptBackup(result.data.refreshToken).toString("base64"),
        expiresAt: result.data.expiresAt,
        connectedByUserId: payload.userId,
      },
    });

    settingsUrl.searchParams.set("cloudBackupConnected", "google_drive");
    return NextResponse.redirect(settingsUrl);
  } catch (e) {
    settingsUrl.searchParams.set("cloudBackupError", e instanceof Error ? e.message : "connection_failed");
    return NextResponse.redirect(settingsUrl);
  }
}
