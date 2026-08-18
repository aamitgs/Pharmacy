"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { encryptBackup, serializeBackup } from "@/lib/backup-crypto";
import { gatherTenantData } from "@/lib/backup-export";
import { signOAuthState } from "@/lib/cloud-backup/oauth-state";
import { buildGoogleDriveAuthUrl, isGoogleDriveConfigured } from "@/lib/cloud-backup/google-drive";
import { buildOneDriveAuthUrl, isOneDriveConfigured } from "@/lib/cloud-backup/onedrive";
import { uploadBackupToProvider } from "@/lib/cloud-backup/upload";
import type { CloudBackupProvider } from "@/generated/prisma/client";

const PROVIDER_LABELS: Record<CloudBackupProvider, string> = {
  google_drive: "Google Drive",
  onedrive: "OneDrive",
};

export async function getCloudBackupInfo() {
  const session = await requireRole(["owner", "pharmacist"]);
  const connections = await prisma.cloudBackupConnection.findMany({ where: { tenantId: session.user.tenantId } });
  const byProvider = new Map(connections.map((c) => [c.provider, c]));

  return {
    google_drive: {
      configured: isGoogleDriveConfigured(),
      connected: byProvider.has("google_drive"),
      connectedAt: byProvider.get("google_drive")?.createdAt ?? null,
    },
    onedrive: {
      configured: isOneDriveConfigured(),
      connected: byProvider.has("onedrive"),
      connectedAt: byProvider.get("onedrive")?.createdAt ?? null,
    },
  };
}

/** Connecting a new backup destination is an ownership decision, same as
 * opening a branch or setting up a ward — owner-only. */
export async function getCloudBackupConnectUrl(provider: CloudBackupProvider) {
  const session = await requireRole(["owner"]);
  const state = signOAuthState({ tenantId: session.user.tenantId, userId: session.user.id, provider });
  const url = provider === "google_drive" ? buildGoogleDriveAuthUrl(state) : buildOneDriveAuthUrl(state);
  if (!url) {
    throw new Error(`${PROVIDER_LABELS[provider]} is not configured on this server — see the README for setup.`);
  }
  return { url };
}

export async function disconnectCloudBackup(provider: CloudBackupProvider) {
  const session = await requireRole(["owner"]);
  await prisma.cloudBackupConnection.deleteMany({ where: { tenantId: session.user.tenantId, provider } });
  revalidatePath("/settings");
}

export async function runCloudBackupNow(provider: CloudBackupProvider) {
  const session = await requireRole(["owner", "pharmacist"]);
  const tenantId = session.user.tenantId;

  let ok = false;
  let note: string | undefined;
  try {
    const data = await gatherTenantData(tenantId);
    const json = serializeBackup(data);
    const encrypted = encryptBackup(json);
    const filename = `pharmacy-backup-${tenantId}-${new Date().toISOString().slice(0, 10)}.enc`;
    const result = await uploadBackupToProvider(tenantId, provider, filename, encrypted);
    ok = result.ok;
    note = result.note;
  } catch (e) {
    note = e instanceof Error ? e.message : "Cloud backup failed";
  }

  await prisma.backupLog.create({ data: { tenantId, destination: provider, status: ok ? "success" : "failed" } });
  revalidatePath("/settings");
  if (!ok) throw new Error(note ?? "Cloud backup failed");
  return { ok: true as const };
}
