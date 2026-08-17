import Link from "next/link";
import { auth } from "@/auth";
import { listInsuranceClaims } from "@/lib/actions/insurance-claims";
import { RestrictedAccess } from "@/components/reports/restricted-access";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";

const STATUS_VARIANT: Record<string, string> = {
  pending: "bg-warning/20 text-warning-foreground",
  approved: "bg-primary/15 text-primary",
  rejected: "bg-destructive/10 text-destructive",
  settled: "bg-success/15 text-success",
};

export default async function InsuranceClaimsPage() {
  const session = await auth();
  if (!session?.user) return null;

  const canView = session.user.role === "owner" || session.user.role === "pharmacist";
  if (!canView) return <RestrictedAccess />;

  const claims = await listInsuranceClaims();
  const outstanding = claims
    .filter((c) => c.status === "pending" || c.status === "approved")
    .reduce((sum, c) => sum + c.claimedAmount, 0);

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-lg font-semibold">Insurance Claims</h1>
        <p className="text-sm text-muted-foreground">
          {claims.length} cashless sale{claims.length === 1 ? "" : "s"} billed to an insurer/TPA
        </p>
      </div>

      <div className="rounded-lg border p-4">
        <div className="text-sm text-muted-foreground">Outstanding (pending + approved)</div>
        <div className="text-2xl font-semibold tabular-nums">₹{outstanding.toFixed(2)}</div>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Invoice</TableHead>
              <TableHead>Patient</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Claim no.</TableHead>
              <TableHead className="text-right">Claimed</TableHead>
              <TableHead className="text-right">Co-pay</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {claims.length ? (
              claims.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {format(new Date(c.invoiceDate), "dd MMM yyyy")}
                  </TableCell>
                  <TableCell>
                    <Link href={`/insurance-claims/${c.id}`} className="font-medium hover:underline">
                      {c.invoiceNo}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{c.customerName || "Walk-in"}</TableCell>
                  <TableCell>{c.providerName}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{c.claimNumber || "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">₹{c.claimedAmount.toFixed(2)}</TableCell>
                  <TableCell className="text-right tabular-nums">₹{c.coPayAmount.toFixed(2)}</TableCell>
                  <TableCell>
                    <Badge className={STATUS_VARIANT[c.status]}>{c.status}</Badge>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                  No insurance claims yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
