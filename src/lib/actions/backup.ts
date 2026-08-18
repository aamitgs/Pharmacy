"use server";

import { prisma } from "@/lib/prisma";
import { requireRole, requireSession } from "@/lib/rbac";
import { encryptBackup, serializeBackup } from "@/lib/backup-crypto";
import { gatherTenantData } from "@/lib/backup-export";

export async function createManualBackup() {
  const session = await requireRole(["owner", "pharmacist"]);
  const tenantId = session.user.tenantId;

  try {
    const data = await gatherTenantData(tenantId);
    const json = serializeBackup(data);
    const encrypted = encryptBackup(json);

    await prisma.backupLog.create({
      data: { tenantId, destination: "manual", status: "success" },
    });

    const filename = `pharmacy-backup-${tenantId}-${new Date().toISOString().slice(0, 10)}.enc`;
    return { ok: true as const, filename, base64: encrypted.toString("base64") };
  } catch (e) {
    await prisma.backupLog.create({
      data: { tenantId, destination: "manual", status: "failed" },
    });
    throw e;
  }
}

export async function getBackupStatus() {
  const session = await requireSession();
  const last = await prisma.backupLog.findFirst({
    where: { tenantId: session.user.tenantId },
    orderBy: { createdAt: "desc" },
  });
  const staleAfterMs = 48 * 60 * 60 * 1000;
  return {
    lastBackupAt: last?.createdAt ?? null,
    lastBackupStatus: last?.status ?? null,
    isStale: !last || Date.now() - last.createdAt.getTime() > staleAfterMs,
  };
}
