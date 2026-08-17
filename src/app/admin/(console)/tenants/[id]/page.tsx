import { notFound } from "next/navigation";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { getTenantForAdmin, getTenantUsageMetrics } from "@/lib/actions/admin";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft } from "lucide-react";
import { TenantAdminControls } from "./tenant-admin-controls";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export default async function AdminTenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ tenant, plans }, usage] = await Promise.all([getTenantForAdmin(id), getTenantUsageMetrics(id)]);
  if (!tenant) notFound();

  return (
    <div className="max-w-3xl space-y-4">
      <Link href="/admin" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> Tenants
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            {tenant.pharmacyName}
            {tenant.suspendedAt && <Badge variant="destructive">Suspended</Badge>}
          </h1>
          <p className="text-sm text-muted-foreground">Created {format(tenant.createdAt, "dd MMM yyyy")}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Branches</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{tenant.branches.length}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Users</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{tenant.users.length}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Invoices</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{tenant._count.salesInvoices}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Usage <span className="font-normal text-muted-foreground">(support/billing — not visible to the tenant)</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <div className="text-xs text-muted-foreground">Active users (30d)</div>
            <div className="text-xl font-semibold">{usage.activeUserCount30d}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Invoices today / this month</div>
            <div className="text-xl font-semibold">
              {usage.invoicesToday} / {usage.invoicesThisMonth}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Storage used</div>
            <div className="text-xl font-semibold">{formatBytes(usage.storageUsedBytes)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">API calls (lifetime)</div>
            <div className="text-xl font-semibold">{usage.apiCallVolumeTotal.toLocaleString("en-IN")}</div>
            <div className="text-[11px] text-muted-foreground">
              {usage.apiKeysActive} active key{usage.apiKeysActive === 1 ? "" : "s"}
              {usage.apiLastUsedAt && ` · last used ${formatDistanceToNow(usage.apiLastUsedAt, { addSuffix: true })}`}
            </div>
          </div>
        </CardContent>
      </Card>

      <TenantAdminControls
        tenantId={tenant.id}
        suspended={!!tenant.suspendedAt}
        currentPlanCode={tenant.subscription?.plan.code ?? null}
        subscriptionStatus={tenant.subscription?.status ?? null}
        plans={plans.map((p) => ({ code: p.code, name: p.name }))}
        tenantType={tenant.tenantType}
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Users</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {tenant.users.map((u) => (
            <div key={u.id} className="flex items-center justify-between border-b py-1.5 last:border-0">
              <span>{u.name} · {u.email}</span>
              <Badge variant="outline">{u.role.replace("_", " ")}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
