import { notFound } from "next/navigation";
import Link from "next/link";
import { getCreditNote } from "@/lib/actions/credit-notes";
import { PrintButton } from "@/components/reports/print-button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { ChevronLeft } from "lucide-react";

const REFUND_LABELS: Record<string, string> = {
  cash: "Cash",
  upi: "UPI",
  card: "Card",
  ledger_adjustment: "Adjusted against customer account",
};

export default async function CreditNotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const note = await getCreditNote(id);
  if (!note) notFound();

  const cgst = Math.round((note.taxAmount / 2 + Number.EPSILON) * 100) / 100;
  const sgst = Math.round((note.taxAmount - cgst + Number.EPSILON) * 100) / 100;

  return (
    <div className="space-y-4 p-6">
      <style>{`@page { size: A4; margin: 14mm; }`}</style>

      <div className="flex items-center justify-between print:hidden">
        <Link
          href="/credit-notes"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" /> All credit notes
        </Link>
        <PrintButton />
      </div>

      <div className="mx-auto max-w-3xl space-y-5 rounded-lg border p-8 print:border-0 print:p-0">
        <div className="text-center">
          <h1 className="text-lg font-semibold tracking-wide uppercase">Credit Note</h1>
          <p className="text-sm">{note.branch.name}</p>
          {note.branch.licensedAddress && (
            <p className="text-xs text-muted-foreground">{note.branch.licensedAddress}</p>
          )}
          {note.branch.gstin && <p className="text-xs text-muted-foreground">GSTIN: {note.branch.gstin}</p>}
        </div>

        <div className="grid grid-cols-2 gap-4 border-y py-3 text-sm">
          <div className="space-y-0.5">
            <div>
              <span className="text-muted-foreground">Credit note no.</span>{" "}
              <span className="font-medium">{note.creditNoteNo}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Date</span>{" "}
              {format(new Date(note.creditNoteDate), "dd MMM yyyy")}
            </div>
            <div>
              <span className="text-muted-foreground">Raised by</span> {note.createdByName}
            </div>
          </div>
          <div className="space-y-0.5">
            <div>
              <span className="text-muted-foreground">Against invoice</span>{" "}
              <Link href={`/invoices/${note.invoice.id}/receipt`} className="font-medium underline print:no-underline">
                {note.invoice.invoiceNo}
              </Link>{" "}
              <span className="text-muted-foreground">
                ({format(new Date(note.invoice.invoiceDate), "dd MMM yyyy")})
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Customer</span> {note.invoice.customerName}
            </div>
            <div>
              <span className="text-muted-foreground">Refund</span>{" "}
              {REFUND_LABELS[note.refundMode] ?? note.refundMode}
            </div>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>HSN</TableHead>
              <TableHead>Batch</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Rate</TableHead>
              <TableHead className="text-right">Taxable</TableHead>
              <TableHead className="text-right">GST%</TableHead>
              <TableHead className="text-right">Tax</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {note.items.map((i, idx) => (
              <TableRow key={idx}>
                <TableCell className="font-medium">{i.itemName}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{i.hsnCode ?? "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{i.batchNo}</TableCell>
                <TableCell className="text-right tabular-nums">{i.qty}</TableCell>
                <TableCell className="text-right tabular-nums">₹{i.rate.toFixed(2)}</TableCell>
                <TableCell className="text-right tabular-nums">₹{i.taxableValue.toFixed(2)}</TableCell>
                <TableCell className="text-right tabular-nums">{i.taxRate}%</TableCell>
                <TableCell className="text-right tabular-nums">₹{i.taxAmount.toFixed(2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="ml-auto max-w-xs space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Taxable value</span>
            <span className="tabular-nums">₹{note.subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">CGST</span>
            <span className="tabular-nums">₹{cgst.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">SGST</span>
            <span className="tabular-nums">₹{sgst.toFixed(2)}</span>
          </div>
          <div className="flex justify-between border-t pt-1 font-semibold">
            <span>Total credited</span>
            <span className="tabular-nums">₹{note.total.toFixed(2)}</span>
          </div>
        </div>

        <div className="space-y-1 border-t pt-3 text-sm">
          <div>
            <span className="text-muted-foreground">Reason:</span> {note.reason}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Returned goods:</span>
            {note.restocked ? (
              <Badge variant="outline">Resalable — returned to stock</Badge>
            ) : (
              <Badge className="bg-destructive/10 text-destructive hover:bg-destructive/10">
                Not resalable — written off
              </Badge>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
