import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canEditItemMaster } from "@/lib/rbac";
import { getBackupStatus } from "@/lib/actions/backup";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BackupPanel } from "@/components/settings/backup-panel";
import { SecurityPanel } from "@/components/settings/security-panel";
import { ImportPanel } from "@/components/settings/import-panel";
import { ExportPanel } from "@/components/settings/export-panel";
import { Separator } from "@/components/ui/separator";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) return null;

  const [backupStatus, user] = await Promise.all([
    getBackupStatus(),
    prisma.user.findUniqueOrThrow({ where: { id: session.user.id } }),
  ]);
  const canImport = canEditItemMaster(session.user.role);

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-lg font-semibold">Settings</h1>
      <Tabs defaultValue="backup">
        <TabsList>
          <TabsTrigger value="backup">Backup</TabsTrigger>
          <TabsTrigger value="data">Import / Export</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>
        <TabsContent value="backup" className="pt-4">
          <BackupPanel
            lastBackupAt={backupStatus.lastBackupAt}
            lastBackupStatus={backupStatus.lastBackupStatus}
            isStale={backupStatus.isStale}
          />
        </TabsContent>
        <TabsContent value="data" className="space-y-6 pt-4">
          {canImport && (
            <>
              <ImportPanel />
              <Separator className="max-w-3xl" />
            </>
          )}
          <ExportPanel />
        </TabsContent>
        <TabsContent value="security" className="pt-4">
          <SecurityPanel totpEnabled={user.totpEnabled} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
