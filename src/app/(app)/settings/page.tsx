import { Suspense } from "react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canEditItemMaster, canManageCompliance, canManageUsers } from "@/lib/rbac";
import { getBackupStatus } from "@/lib/actions/backup";
import { getCloudBackupInfo } from "@/lib/actions/cloud-backup";
import { getLicenseExpiryWindow } from "@/lib/actions/branch-settings";
import { listGstFilingReminders } from "@/lib/actions/gst-reminders";
import { getBillingInfo } from "@/lib/actions/subscription";
import { getBrandingInfo } from "@/lib/actions/branding";
import { getApiAccessInfo } from "@/lib/actions/api-keys";
import { getRefillReminderSettings } from "@/lib/actions/refill-reminders";
import { listWards } from "@/lib/actions/wards";
import { listStaff } from "@/lib/actions/staff";
import { listBranches } from "@/lib/actions/branches";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BackupPanel } from "@/components/settings/backup-panel";
import { SecurityPanel } from "@/components/settings/security-panel";
import { ImportPanel } from "@/components/settings/import-panel";
import { ExportPanel } from "@/components/settings/export-panel";
import { CompliancePanel } from "@/components/settings/compliance-panel";
import { BillingPanel } from "@/components/settings/billing-panel";
import { BrandingPanel } from "@/components/settings/branding-panel";
import { ApiPanel } from "@/components/settings/api-panel";
import { WardsPanel } from "@/components/settings/wards-panel";
import { StaffPanel } from "@/components/settings/staff-panel";
import { RefillRemindersPanel } from "@/components/settings/refill-reminders-panel";
import { NotificationsPanel } from "@/components/settings/notifications-panel";
import { LanguagePanel } from "@/components/settings/language-panel";
import { AccessibilityPanel } from "@/components/settings/accessibility-panel";
import { FeedbackPanel } from "@/components/settings/feedback-panel";
import { getFeedbackSettings } from "@/lib/actions/customer-feedback";
import { Separator } from "@/components/ui/separator";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) return null;

  const canImport = canEditItemMaster(session.user.role);
  const canCompliance = canManageCompliance(session.user.role);
  const canBilling = canManageUsers(session.user.role);
  const canManageStaff = canManageUsers(session.user.role);
  const canBackup = session.user.role === "owner" || session.user.role === "pharmacist" || session.user.role === "ward_pharmacist";

  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: session.user.tenantId } });
  const isHospital = tenant.tenantType === "hospital";

  const canReminders = session.user.role === "owner";
  // Mirrors DISCOUNT_OVERRIDE_ROLES in src/lib/actions/pos.ts.
  const canHoldOverridePin =
    session.user.role === "owner" || session.user.role === "pharmacist";

  const [backupStatus, cloudBackupInfo, user, licenseWindow, gstReminders, billing, branding, apiAccess, wards, staff, branches, refillReminders, feedbackSettings] = await Promise.all([
    getBackupStatus(),
    canBackup ? getCloudBackupInfo() : Promise.resolve(null),
    prisma.user.findUniqueOrThrow({ where: { id: session.user.id } }),
    canCompliance ? getLicenseExpiryWindow() : Promise.resolve(null),
    canCompliance ? listGstFilingReminders() : Promise.resolve([]),
    canBilling ? getBillingInfo() : Promise.resolve(null),
    canBilling ? getBrandingInfo() : Promise.resolve(null),
    canBilling ? getApiAccessInfo() : Promise.resolve(null),
    isHospital && canManageUsers(session.user.role) ? listWards() : Promise.resolve(null),
    canManageStaff ? listStaff() : Promise.resolve(null),
    canManageStaff ? listBranches() : Promise.resolve(null),
    canReminders ? getRefillReminderSettings() : Promise.resolve(null),
    canReminders ? getFeedbackSettings() : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-lg font-semibold">Settings</h1>
      <Tabs defaultValue="backup">
        <TabsList>
          <TabsTrigger value="backup">Backup</TabsTrigger>
          <TabsTrigger value="data">Import / Export</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="language">Language</TabsTrigger>
          <TabsTrigger value="accessibility">Accessibility</TabsTrigger>
          {canCompliance && <TabsTrigger value="compliance">Compliance</TabsTrigger>}
          {canBilling && <TabsTrigger value="branding">Branding</TabsTrigger>}
          {canBilling && <TabsTrigger value="billing">Billing</TabsTrigger>}
          {canBilling && <TabsTrigger value="api">API</TabsTrigger>}
          {canManageStaff && <TabsTrigger value="staff">Staff</TabsTrigger>}
          {isHospital && wards && <TabsTrigger value="wards">Wards</TabsTrigger>}
          {canReminders && refillReminders && <TabsTrigger value="reminders">Reminders</TabsTrigger>}
          {canReminders && <TabsTrigger value="notifications">Notifications</TabsTrigger>}
          {canReminders && feedbackSettings && <TabsTrigger value="feedback">Feedback</TabsTrigger>}
        </TabsList>
        <TabsContent value="backup" className="pt-4">
          <Suspense fallback={null}>
            <BackupPanel
              lastBackupAt={backupStatus.lastBackupAt}
              lastBackupStatus={backupStatus.lastBackupStatus}
              isStale={backupStatus.isStale}
              cloudBackupInfo={cloudBackupInfo}
              canConnectCloud={session.user.role === "owner"}
            />
          </Suspense>
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
          <SecurityPanel
            totpEnabled={user.totpEnabled}
            overridePinSet={canHoldOverridePin ? user.overridePinHash !== null : null}
          />
        </TabsContent>
        <TabsContent value="language" className="pt-4">
          <LanguagePanel />
        </TabsContent>
        <TabsContent value="accessibility" className="pt-4">
          <AccessibilityPanel initialHighContrast={user.highContrast} />
        </TabsContent>
        {canCompliance && licenseWindow && (
          <TabsContent value="compliance" className="pt-4">
            <CompliancePanel initial={licenseWindow} initialGstReminders={gstReminders} />
          </TabsContent>
        )}
        {canBilling && branding && (
          <TabsContent value="branding" className="pt-4">
            <BrandingPanel initial={branding} />
          </TabsContent>
        )}
        {canBilling && billing && (
          <TabsContent value="billing" className="pt-4">
            <BillingPanel initial={billing} />
          </TabsContent>
        )}
        {canBilling && apiAccess && (
          <TabsContent value="api" className="pt-4">
            <ApiPanel initial={apiAccess} />
          </TabsContent>
        )}
        {canManageStaff && staff && (
          <TabsContent value="staff" className="pt-4">
            <StaffPanel initialStaff={staff} wards={wards?.map((w) => ({ id: w.id, name: w.name })) ?? []} isHospital={isHospital} />
          </TabsContent>
        )}
        {isHospital && wards && (
          <TabsContent value="wards" className="pt-4">
            <WardsPanel initialWards={wards} branches={branches ?? []} />
          </TabsContent>
        )}
        {canReminders && refillReminders && (
          <TabsContent value="reminders" className="pt-4">
            <RefillRemindersPanel initialEnabled={refillReminders.enabled} />
          </TabsContent>
        )}
        {canReminders && (
          <TabsContent value="notifications" className="pt-4">
            <NotificationsPanel />
          </TabsContent>
        )}
        {canReminders && feedbackSettings && (
          <TabsContent value="feedback" className="pt-4">
            <FeedbackPanel initialEnabled={feedbackSettings.enabled} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
