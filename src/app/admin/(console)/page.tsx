import Link from "next/link";
import { listTenantsForAdmin } from "@/lib/actions/admin";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";

export default async function AdminTenantsPage() {
  const tenants = await listTenantsForAdmin();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Tenants</h1>
        <p className="text-sm text-muted-foreground">{tenants.length} total</p>
      </div>
      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pharmacy</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Branches</TableHead>
              <TableHead>Users</TableHead>
              <TableHead>Created</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {tenants.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">{t.pharmacyName}</TableCell>
                <TableCell>{t.subscription?.plan.name ?? "—"}</TableCell>
                <TableCell>
                  {t.suspendedAt ? (
                    <Badge variant="destructive">Suspended</Badge>
                  ) : (
                    <Badge variant="outline">{t.subscription?.status ?? "—"}</Badge>
                  )}
                </TableCell>
                <TableCell>{t._count.branches}</TableCell>
                <TableCell>{t._count.users}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {format(t.createdAt, "dd MMM yyyy")}
                </TableCell>
                <TableCell>
                  <Link href={`/admin/tenants/${t.id}`} className="text-sm underline underline-offset-2">
                    View
                  </Link>
                </TableCell>
              </TableRow>
            ))}
            {tenants.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  No tenants yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
