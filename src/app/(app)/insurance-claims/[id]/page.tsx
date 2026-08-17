import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { getInsuranceClaim } from "@/lib/actions/insurance-claims";
import { RestrictedAccess } from "@/components/reports/restricted-access";
import { InsuranceClaimStatusActions } from "@/components/insurance/insurance-claim-status-actions";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { ChevronLeft } from "lucide-react";

const STATUS_VARIANT: Record<string, string> = {
  pending: "bg-warning/20 text-warning-foreground",
  approved: "bg-primary/15 text-primary",
  rejected: "bg-destructive/10 text-destructive",
  settled: "bg-success/15 text-success",
};

export default async function InsuranceClaimDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return null;

  const canView = session.user.role === "owner" || session.user.role === "pharmacist";
  if (!canView) return <RestrictedAccess />;

  const { id } = await params;
  const claim = await getInsuranceClaim(id);
  if (!claim) notFound();

  return (
    <div className="space-y-4 p-6">
      <Link
        href="/insurance-claims"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> Insurance Claims
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold">
            Claim for invoice {claim.invoice.invoiceNo}
          </h1>
          <p className="text-sm text-muted-foreground">
            {claim.provider.name}
            {claim.provider.tpaCode && ` (${claim.provider.tpaCode})`} ·{" "}
            {format(new Date(claim.invoice.invoiceDate), "dd MMM yyyy")} · {claim.invoice.branchName}
          </p>
        </div>
        <Badge className={STATUS_VARIANT[claim.status]}>{claim.status}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border p-3">
          <div className="text-xs text-muted-foreground">Invoice total</div>
          <div className="text-lg font-semibold tabular-nums">₹{claim.invoice.total.toFixed(2)}</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-xs text-muted-foreground">Co-pay collected</div>
          <div className="text-lg font-semibold tabular-nums">₹{claim.coPayAmount.toFixed(2)}</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-xs text-muted-foreground">Claimed from insurer</div>
          <div className="text-lg font-semibold tabular-nums">₹{claim.claimedAmount.toFixed(2)}</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-xs text-muted-foreground">Settled amount</div>
          <div className="text-lg font-semibold tabular-nums">
            {claim.settledAmount !== null ? `₹${claim.settledAmount.toFixed(2)}` : "—"}
          </div>
        </div>
      </div>

      <div className="rounded-md border p-3 text-sm">
        <div className="font-medium">
          {claim.invoice.customerName || "Walk-in patient"}
          {claim.invoice.customerPhone && ` · ${claim.invoice.customerPhone}`}
        </div>
        {claim.claimNumber && <div className="text-muted-foreground">Claim no. {claim.claimNumber}</div>}
        {claim.rejectionReason && (
          <div className="mt-1 text-destructive">Rejection reason: {claim.rejectionReason}</div>
        )}
        {claim.notes && <div className="mt-1 text-muted-foreground">Notes: {claim.notes}</div>}
      </div>

      <InsuranceClaimStatusActions claimId={claim.id} status={claim.status} claimedAmount={claim.claimedAmount} />

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Rate</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {claim.invoice.items.map((i, idx) => (
              <TableRow key={idx}>
                <TableCell className="font-medium">
                  {i.itemName} <span className="text-muted-foreground">({i.unit})</span>
                </TableCell>
                <TableCell className="text-right tabular-nums">{i.qty}</TableCell>
                <TableCell className="text-right tabular-nums">₹{i.rate.toFixed(2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
