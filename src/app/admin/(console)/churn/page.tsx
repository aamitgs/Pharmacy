import { format } from "date-fns";
import { getChurnReport } from "@/lib/actions/admin";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export default async function AdminChurnPage() {
  const rows = await getChurnReport();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Churn</h1>
        <p className="text-sm text-muted-foreground">
          Cancelled subscriptions, and trials that expired without converting.
        </p>
      </div>
      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pharmacy</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Signed up</TableHead>
              <TableHead>Trial ended</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.tenant.pharmacyName}</TableCell>
                <TableCell>{r.plan.name}</TableCell>
                <TableCell>
                  <Badge variant={r.status === "cancelled" ? "destructive" : "outline"}>{r.status}</Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {format(r.tenant.createdAt, "dd MMM yyyy")}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {r.trialEndsAt ? format(r.trialEndsAt, "dd MMM yyyy") : "—"}
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  No churn yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
