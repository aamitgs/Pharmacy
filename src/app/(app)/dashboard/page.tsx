import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { getTranslations, getLocale } from "next-intl/server";
import { getDashboardData } from "@/lib/actions/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import type { AppLocale } from "@/i18n/locales";
import { AlertTriangle, Clock, IndianRupee, PackageX, Receipt, RefreshCcw } from "lucide-react";

export default async function DashboardPage() {
  const [data, t, locale] = await Promise.all([
    getDashboardData(),
    getTranslations("dashboard"),
    getLocale() as Promise<AppLocale>,
  ]);
  const showOnboarding = !data.onboarding.hasItems || !data.onboarding.hasSale;

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-lg font-semibold">{data.pharmacyName}</h1>
        <p className="text-sm text-muted-foreground">{t("todayAtAGlance")}</p>
      </div>

      {showOnboarding && (
        <OnboardingChecklist hasItems={data.onboarding.hasItems} hasSale={data.onboarding.hasSale} />
      )}

      {data.backupStatus.isStale && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{t("backupOverdue")}</AlertTitle>
          <AlertDescription>
            {data.backupStatus.lastBackupAt
              ? t("lastBackupWasAgo", { time: formatDistanceToNow(data.backupStatus.lastBackupAt) })
              : t("noBackupYet")}{" "}
            <Link href="/settings" className="underline underline-offset-2">
              {t("runOneNow")}
            </Link>
            .
          </AlertDescription>
        </Alert>
      )}

      {data.licenseExpiryCount > 0 && data.licenseExpirySoonest && (
        <Alert
          variant={data.licenseExpirySoonest.severity === "upcoming" ? "default" : "destructive"}
        >
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>
            {data.licenseExpiryCount === 1
              ? t("licenseRenewalDueOne")
              : t("licenseRenewalDueMany", { count: data.licenseExpiryCount })}
          </AlertTitle>
          <AlertDescription>
            {data.licenseExpirySoonest.label} ({data.licenseExpirySoonest.branchName}){" "}
            {data.licenseExpirySoonest.severity === "expired"
              ? t("licenseExpired")
              : t("licenseExpiresIn", { days: data.licenseExpirySoonest.daysRemaining })}{" "}
            <Link href="/alerts" className="underline underline-offset-2">
              {t("review")}
            </Link>
            .
          </AlertDescription>
        </Alert>
      )}

      {data.gstReminderCount > 0 && data.gstReminderSoonest && (
        <Alert variant={data.gstReminderSoonest.severity === "upcoming" ? "default" : "destructive"}>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>
            {data.gstReminderCount === 1
              ? t("gstReminderDueOne")
              : t("gstReminderDueMany", { count: data.gstReminderCount })}
          </AlertTitle>
          <AlertDescription>
            {data.gstReminderSoonest.label}{" "}
            {data.gstReminderSoonest.severity === "overdue"
              ? t("gstReminderOverdue")
              : t("gstReminderDueIn", { days: data.gstReminderSoonest.daysRemaining })}{" "}
            <Link href="/alerts" className="underline underline-offset-2">
              {t("review")}
            </Link>
            .
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-3 gap-4 lg:grid-cols-6">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("todaysSales")}
            </CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums">
              {formatCurrency(data.todaySalesTotal, locale)}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("invoiceCount", { count: data.todaySalesCount })}
            </p>
          </CardContent>
        </Card>

        <Link href="/alerts">
          <Card className="transition-colors hover:bg-muted/40">
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t("lowStock")}
              </CardTitle>
              <PackageX className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div
                className={cn(
                  "text-2xl font-semibold tabular-nums",
                  data.lowStockCount > 0 && "text-destructive"
                )}
              >
                {data.lowStockCount}
              </div>
              <p className="text-xs text-muted-foreground">{t("belowReorderLevel", { count: data.lowStockCount })}</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/alerts">
          <Card className="transition-colors hover:bg-muted/40">
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t("nearExpiry")}
              </CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div
                className={cn(
                  "text-2xl font-semibold tabular-nums",
                  data.nearExpiryCount > 0 && "text-warning-foreground"
                )}
              >
                {data.nearExpiryCount}
              </div>
              <p className="text-xs text-muted-foreground">
                {t("batchesExpiringSoon", { count: data.nearExpiryCount })}
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/suppliers">
          <Card className="transition-colors hover:bg-muted/40">
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t("supplierOutstanding")}
              </CardTitle>
              <IndianRupee className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div
                className={cn(
                  "text-2xl font-semibold tabular-nums",
                  data.supplierOutstandingTotal > 0 && "text-destructive"
                )}
              >
                {formatCurrency(data.supplierOutstandingTotal, locale)}
              </div>
              <p className="text-xs text-muted-foreground">{t("owedAcrossSuppliers")}</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/settings">
          <Card className="transition-colors hover:bg-muted/40">
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t("lastBackup")}
              </CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div
                className={cn(
                  "text-2xl font-semibold",
                  data.backupStatus.isStale && "text-destructive"
                )}
              >
                {data.backupStatus.lastBackupAt
                  ? formatDistanceToNow(data.backupStatus.lastBackupAt, { addSuffix: true })
                  : t("never")}
              </div>
              <p className="text-xs text-muted-foreground">
                {data.backupStatus.lastBackupStatus ?? t("noBackupsYet")}
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/refill-requests">
          <Card className="transition-colors hover:bg-muted/40">
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t("refillRequests")}
              </CardTitle>
              <RefreshCcw className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div
                className={cn(
                  "text-2xl font-semibold tabular-nums",
                  data.pendingRefillRequestCount > 0 && "text-warning-foreground"
                )}
              >
                {data.pendingRefillRequestCount}
              </div>
              <p className="text-xs text-muted-foreground">
                {t("pendingFromPortal")}
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
