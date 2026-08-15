import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { encryptBackup } from "@/lib/backup-crypto";
import { verifyOAuthState } from "@/lib/cloud-backup/oauth-state";
import { exchangeOneDriveCode } from "@/lib/cloud-backup/onedrive";

/** Same shape as the Google Drive callback — see that file's comment. */
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
    if (payload.provider !== "onedrive") throw new Error("Provider mismatch");

    const session = await auth();
    if (!session?.user || session.user.tenantId !== payload.tenantId || session.user.id !== payload.userId) {
      throw new Error("Session mismatch — please try connecting again from Settings.");
    }

    const result = await exchangeOneDriveCode(code);
    if (!result.ok || !result.data) throw new Error(result.note ?? "Token exchange failed");

    await prisma.cloudBackupConnection.upsert({
      where: { tenantId_provider: { tenantId: payload.tenantId, provider: "onedrive" } },
      create: {
        tenantId: payload.tenantId,
        provider: "onedrive",
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

    settingsUrl.searchParams.set("cloudBackupConnected", "onedrive");
    return NextResponse.redirect(settingsUrl);
  } catch (e) {
    settingsUrl.searchParams.set("cloudBackupError", e instanceof Error ? e.message : "connection_failed");
    return NextResponse.redirect(settingsUrl);
  }
}
