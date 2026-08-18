"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { format, formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { createManualBackup } from "@/lib/actions/backup";
import { getCloudBackupConnectUrl, disconnectCloudBackup, runCloudBackupNow } from "@/lib/actions/cloud-backup";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, CloudUpload, DownloadCloud, Loader2, Unlink } from "lucide-react";
import { TrustSeal } from "@/components/ui/trust-seal";
import type { CloudBackupProvider } from "@/generated/prisma/client";

function base64ToBlob(base64: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: "application/octet-stream" });
}

interface CloudProviderInfo {
  configured: boolean;
  connected: boolean;
  connectedAt: Date | null;
}

const PROVIDER_LABELS: Record<CloudBackupProvider, string> = {
  google_drive: "Google Drive",
  onedrive: "OneDrive",
};

function CloudProviderRow({
  provider,
  info,
  canConnect,
}: {
  provider: CloudBackupProvider;
  info: CloudProviderInfo;
  canConnect: boolean;
}) {
  const [connectPending, startConnect] = useTransition();
  const [backupPending, startBackup] = useTransition();
  const [connected, setConnected] = useState(info.connected);

  function connect() {
    startConnect(async () => {
      try {
        const { url } = await getCloudBackupConnectUrl(provider);
        window.location.assign(url);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not start connection");
      }
    });
  }

  function disconnect() {
    startConnect(async () => {
      try {
        await disconnectCloudBackup(provider);
        setConnected(false);
        toast.success(`${PROVIDER_LABELS[provider]} disconnected`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not disconnect");
      }
    });
  }

  function backupNow() {
    startBackup(async () => {
      try {
        await runCloudBackupNow(provider);
        toast.success(`Backed up to ${PROVIDER_LABELS[provider]}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Cloud backup failed");
      }
    });
  }

  return (
    <div className="flex items-center justify-between rounded-lg border p-3">
      <div className="space-y-0.5">
        <div className="flex items-center gap-2 text-sm font-medium">
          {PROVIDER_LABELS[provider]}
          {connected && (
            <Badge variant="outline" className="gap-1">
              <CheckCircle2 className="h-3 w-3 text-success" /> Connected
            </Badge>
          )}
          {!info.configured && <Badge variant="secondary">Not configured on this server</Badge>}
        </div>
        {connected && info.connectedAt && (
          <p className="text-xs text-muted-foreground">Since {format(info.connectedAt, "dd MMM yyyy")}</p>
        )}
      </div>
      <div className="flex gap-2">
        {connected ? (
          <>
            <Button size="sm" variant="outline" disabled={backupPending} onClick={backupNow}>
              {backupPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />}
              Backup now
            </Button>
            {canConnect && (
              <Button size="sm" variant="ghost" disabled={connectPending} onClick={disconnect}>
                {connectPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />}
                Disconnect
              </Button>
            )}
          </>
        ) : (
          canConnect && (
            <Button size="sm" variant="outline" disabled={connectPending || !info.configured} onClick={connect}>
              {connectPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Connect
            </Button>
          )
        )}
      </div>
    </div>
  );
}

export function BackupPanel({
  lastBackupAt,
  lastBackupStatus,
  isStale,
  cloudBackupInfo,
  canConnectCloud,
}: {
  lastBackupAt: Date | null;
  lastBackupStatus: string | null;
  isStale: boolean;
  cloudBackupInfo: { google_drive: CloudProviderInfo; onedrive: CloudProviderInfo } | null;
  canConnectCloud: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState({ lastBackupAt, lastBackupStatus, isStale });

  useEffect(() => {
    const connected = searchParams.get("cloudBackupConnected");
    const error = searchParams.get("cloudBackupError");
    if (connected) {
      toast.success(`${PROVIDER_LABELS[connected as CloudBackupProvider] ?? connected} connected`);
      router.replace("/settings");
    } else if (error) {
      toast.error(`Could not connect: ${error.replace(/_/g, " ")}`);
      router.replace("/settings");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function runBackup() {
    startTransition(async () => {
      try {
        const result = await createManualBackup();
        const blob = base64ToBlob(result.base64);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = result.filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        setStatus({ lastBackupAt: new Date(), lastBackupStatus: "success", isStale: false });
        toast.success("Backup downloaded");
      } catch (e) {
        setStatus((s) => ({ ...s, lastBackupStatus: "failed" }));
        toast.error(e instanceof Error ? e.message : "Backup failed");
      }
    });
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <TrustSeal />
          Local backup
        </h2>
        <p className="text-sm text-muted-foreground">
          Exports items, batches, invoices, customers, and doctors as an AES-256 encrypted file
          that downloads to this device. Keep the file and your <code>BACKUP_ENCRYPTION_KEY</code>{" "}
          together somewhere safe — both are needed to restore.
        </p>
      </div>

      {status.isStale && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Backup overdue</AlertTitle>
          <AlertDescription>
            {status.lastBackupAt
              ? `Last backup was ${formatDistanceToNow(status.lastBackupAt)} ago. `
              : "No backup has been taken yet. "}
            Run one now to stay covered.
          </AlertDescription>
        </Alert>
      )}
      {!status.isStale && status.lastBackupAt && (
        <Alert>
          <CheckCircle2 className="h-4 w-4 text-success" />
          <AlertDescription>
            Last backup {format(status.lastBackupAt, "dd MMM yyyy, HH:mm")} (
            {status.lastBackupStatus})
          </AlertDescription>
        </Alert>
      )}

      <Button onClick={runBackup} disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <DownloadCloud className="h-4 w-4" />}
        Backup now
      </Button>

      <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Scheduled backups (self-hosted)</p>
        <p className="mt-1">
          For an automatic daily backup, point an OS-level cron (or your container
          orchestrator&apos;s scheduler) at{" "}
          <code>POST /api/backup/scheduled</code> with header{" "}
          <code>x-backup-secret: $BACKUP_CRON_SECRET</code>. It writes an encrypted file to the{" "}
          <code>backups/</code> volume and logs the attempt here, the same as a manual run. See
          the README for a sample crontab entry.
        </p>
      </div>

      {cloudBackupInfo && (
        <div className="space-y-2 border-t pt-4">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-medium">
              <TrustSeal />
              Cloud backup
            </h2>
            <p className="text-sm text-muted-foreground">
              Connect Google Drive and/or OneDrive to also send encrypted backups off-device.
              Files are encrypted the same way as the local backup before upload — the cloud
              provider only ever sees the AES-256 ciphertext, never your data. A scheduled backup
              (above) uploads to every connected destination automatically.
            </p>
          </div>
          <CloudProviderRow provider="google_drive" info={cloudBackupInfo.google_drive} canConnect={canConnectCloud} />
          <CloudProviderRow provider="onedrive" info={cloudBackupInfo.onedrive} canConnect={canConnectCloud} />
        </div>
      )}
    </div>
  );
}
