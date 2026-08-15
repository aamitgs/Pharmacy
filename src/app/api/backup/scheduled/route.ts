import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { basePrisma, prisma, tenantContext } from "@/lib/prisma";
import { encryptBackup } from "@/lib/backup-crypto";
import { uploadBackupToProvider } from "@/lib/cloud-backup/upload";

// Intended to be hit by an OS-level cron / scheduler (see README), not by a
// logged-in user — auth is a shared secret header rather than a session.
// Writes the encrypted export straight to the local backups volume so the
// "Backup Now" button in Settings isn't the only way to get a daily backup.
export async function POST(req: NextRequest) {
  const secret = process.env.BACKUP_CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "BACKUP_CRON_SECRET not configured" }, { status: 501 });
  }
  if (req.headers.get("x-backup-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Listing every tenant is the one legitimate cross-tenant read here — the
  // per-tenant export queries below each run under that specific tenant's
  // own RLS context instead, since the tenantId is already known per
  // iteration.
  const [, tenants] = await basePrisma.$transaction([
    basePrisma.$executeRaw`SELECT set_config('app.rls_bypass', 'true', true)`,
    basePrisma.tenant.findMany({ select: { id: true } }),
  ]);
  const results: { tenantId: string; ok: boolean }[] = [];

  for (const { id: tenantId } of tenants) {
    try {
      const [tenant, branches, items, batches, customers, doctors, invoices] = await tenantContext.run(
        { tenantId },
        () =>
          Promise.all([
            prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
            prisma.branch.findMany({ where: { tenantId } }),
            prisma.item.findMany({ where: { tenantId } }),
            prisma.batch.findMany({ where: { item: { tenantId } } }),
            prisma.customer.findMany({ where: { tenantId } }),
            prisma.doctor.findMany({ where: { tenantId } }),
            prisma.salesInvoice.findMany({ where: { tenantId }, include: { items: true, discounts: true } }),
          ])
      );
      const json = JSON.stringify({
        exportedAt: new Date().toISOString(),
        tenant,
        branches,
        items,
        batches,
        customers,
        doctors,
        invoices,
      });
      const encrypted = encryptBackup(json);

      const dir = process.env.BACKUP_LOCAL_DIR || path.join(process.cwd(), "backups");
      await mkdir(dir, { recursive: true });
      const filename = `pharmacy-backup-${tenantId}-${new Date().toISOString().replace(/[:.]/g, "-")}.enc`;
      await writeFile(path.join(dir, filename), encrypted);

      await tenantContext.run({ tenantId }, () =>
        prisma.backupLog.create({ data: { tenantId, destination: "local", status: "success" } })
      );
      results.push({ tenantId, ok: true });

      // Cloud destinations, if connected — a failed cloud upload never
      // fails the local backup that already succeeded above, and each
      // provider is independent of the others.
      const connections = await tenantContext.run({ tenantId }, () =>
        prisma.cloudBackupConnection.findMany({ where: { tenantId } })
      );
      for (const conn of connections) {
        const cloudFilename = `pharmacy-backup-${tenantId}-${new Date().toISOString().replace(/[:.]/g, "-")}.enc`;
        const uploadResult = await tenantContext.run({ tenantId }, () =>
          uploadBackupToProvider(tenantId, conn.provider, cloudFilename, encrypted)
        );
        await tenantContext.run({ tenantId }, () =>
          prisma.backupLog.create({
            data: { tenantId, destination: conn.provider, status: uploadResult.ok ? "success" : "failed" },
          })
        );
      }
    } catch {
      await tenantContext.run({ tenantId }, () =>
        prisma.backupLog.create({ data: { tenantId, destination: "local", status: "failed" } })
      );
      results.push({ tenantId, ok: false });
    }
  }

  return NextResponse.json({ results });
}
