import "server-only";
import { prisma } from "@/lib/prisma";
import { encryptBackup, decryptBackup } from "@/lib/backup-crypto";
import { refreshGoogleDriveToken, uploadToGoogleDrive } from "./google-drive";
import { refreshOneDriveToken, uploadToOneDrive } from "./onedrive";
import type { CloudBackupProvider } from "@/generated/prisma/client";

// Refresh a little before actual expiry so an upload never races a token
// that's still technically valid when checked but expires mid-request.
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

/** Shared by the manual "Backup now" action and the scheduled cron route —
 * looks up the tenant's stored connection, refreshes the access token if
 * it's near expiry (persisting the refreshed token back, still encrypted),
 * and uploads. Returns a result rather than throwing so callers can log a
 * BackupLog row exactly once regardless of which step failed. */
export async function uploadBackupToProvider(
  tenantId: string,
  provider: CloudBackupProvider,
  filename: string,
  content: Buffer
): Promise<{ ok: boolean; note?: string }> {
  const connection = await prisma.cloudBackupConnection.findUnique({
    where: { tenantId_provider: { tenantId, provider } },
  });
  if (!connection) return { ok: false, note: "Not connected" };

  let accessToken = decryptBackup(Buffer.from(connection.accessTokenEnc, "base64"));

  if (connection.expiresAt.getTime() - REFRESH_MARGIN_MS < Date.now()) {
    const refreshToken = decryptBackup(Buffer.from(connection.refreshTokenEnc, "base64"));
    const refreshed =
      provider === "google_drive" ? await refreshGoogleDriveToken(refreshToken) : await refreshOneDriveToken(refreshToken);
    if (!refreshed.ok || !refreshed.data) {
      return { ok: false, note: refreshed.note ?? "Token refresh failed — reconnect this destination in Settings." };
    }
    accessToken = refreshed.data.accessToken;
    await prisma.cloudBackupConnection.update({
      where: { id: connection.id },
      data: { accessTokenEnc: encryptBackup(accessToken).toString("base64"), expiresAt: refreshed.data.expiresAt },
    });
  }

  const result =
    provider === "google_drive"
      ? await uploadToGoogleDrive(accessToken, filename, content)
      : await uploadToOneDrive(accessToken, filename, content);
  return result.ok ? { ok: true } : { ok: false, note: result.note };
}
