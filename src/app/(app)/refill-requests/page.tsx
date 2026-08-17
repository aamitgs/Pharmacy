import Link from "next/link";
import { listRefillRequests } from "@/lib/actions/refill-requests";
import { RefillRequestActions } from "@/components/refill-requests/refill-request-actions";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";

const STATUS_VARIANT: Record<string, string> = {
  pending: "bg-warning/20 text-warning-foreground",
  fulfilled: "bg-success/15 text-success",
  dismissed: "bg-muted text-muted-foreground",
};

export default async function RefillRequestsPage() {
  const requests = await listRefillRequests();
  const pendingCount = requests.filter((r) => r.status === "pending").length;

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-lg font-semibold">Refill Requests</h1>
        <p className="text-sm text-muted-foreground">
          {pendingCount} pending · submitted by customers through the online portal — ring up the
          actual refill through the normal POS screen once you&apos;ve acted on one.
        </p>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Requested</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Original order</TableHead>
              <TableHead>Note</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-48" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.length ? (
              requests.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {format(new Date(r.createdAt), "dd MMM yyyy, h:mm a")}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{r.customerName}</div>
                    {r.customerPhone && <div className="text-xs text-muted-foreground">{r.customerPhone}</div>}
                  </TableCell>
                  <TableCell className="text-sm">
                    {r.invoiceId ? (
                      <Link href={`/invoices/${r.invoiceId}/receipt`} className="hover:underline">
                        {r.invoiceNo}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="max-w-64 truncate text-sm text-muted-foreground">{r.note || "—"}</TableCell>
                  <TableCell>
                    <Badge className={STATUS_VARIANT[r.status]}>{r.status}</Badge>
                  </TableCell>
                  <TableCell>{r.status === "pending" && <RefillRequestActions id={r.id} />}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  No refill requests yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
