import Link from "next/link";
import { listCreditNotes } from "@/lib/actions/credit-notes";
import { defaultMonthRange } from "@/lib/date-range";
import { DateRangeFilter } from "@/components/reports/date-range-filter";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";

const REFUND_LABELS: Record<string, string> = {
  cash: "Cash",
  upi: "UPI",
  card: "Card",
  ledger_adjustment: "Account adjustment",
};

export default async function CreditNotesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from, to } = defaultMonthRange(await searchParams);
  const notes = await listCreditNotes(from, to);
  const total = notes.reduce((sum, n) => sum + n.total, 0);

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-lg font-semibold">Credit Notes</h1>
        <p className="text-sm text-muted-foreground">
          Customer returns against sales invoices · ₹{total.toFixed(2)} credited across{" "}
          {notes.length} {notes.length === 1 ? "note" : "notes"}
        </p>
      </div>

      <DateRangeFilter from={from} to={to} basePath="/credit-notes" />

      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Credit note</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Against invoice</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Stock</TableHead>
              <TableHead>Refund</TableHead>
              <TableHead className="text-right">Units</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {notes.map((n) => (
              <TableRow key={n.id}>
                <TableCell className="font-medium">
                  <Link href={`/credit-notes/${n.id}`} className="text-primary hover:underline">
                    {n.creditNoteNo}
                  </Link>
                </TableCell>
                <TableCell>{format(new Date(n.creditNoteDate), "dd MMM yyyy")}</TableCell>
                <TableCell>
                  <Link
                    href={`/invoices/${n.invoiceId}/receipt`}
                    className="text-primary hover:underline"
                  >
                    {n.invoiceNo}
                  </Link>
                </TableCell>
                <TableCell className="max-w-[18rem] truncate text-sm text-muted-foreground">
                  {n.reason}
                </TableCell>
                <TableCell>
                  {n.restocked ? (
                    <Badge variant="outline">Restocked</Badge>
                  ) : (
                    <Badge className="bg-destructive/10 text-destructive hover:bg-destructive/10">
                      Written off
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-sm">{REFUND_LABELS[n.refundMode] ?? n.refundMode}</TableCell>
                <TableCell className="text-right tabular-nums">{n.unitCount}</TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  ₹{n.total.toFixed(2)}
                </TableCell>
              </TableRow>
            ))}
            {notes.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                  No credit notes in this period.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
