import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { getTenantForAdmin } from "@/lib/actions/admin";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft } from "lucide-react";
import { TenantAdminControls } from "./tenant-admin-controls";

export default async function AdminTenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { tenant, plans } = await getTenantForAdmin(id);
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

      <TenantAdminControls
        tenantId={tenant.id}
        suspended={!!tenant.suspendedAt}
        currentPlanCode={tenant.subscription?.plan.code ?? null}
        subscriptionStatus={tenant.subscription?.status ?? null}
        plans={plans.map((p) => ({ code: p.code, name: p.name }))}
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
