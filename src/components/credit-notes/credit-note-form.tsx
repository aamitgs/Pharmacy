"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createCreditNote } from "@/lib/actions/credit-notes";
import { computeCreditNote, type ReturnableLine } from "@/lib/credit-note";
import { AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

export interface ReturnLineView extends ReturnableLine {
  itemName: string;
  batchNo: string;
  scheduleClass: string;
  remainingQty: number;
}

/**
 * Records a customer return against an invoice. Quantities are per line and
 * capped at what is left, so a second return against the same bill can only
 * take what the first one did not.
 */
export function CreditNoteForm({
  invoiceId,
  invoiceNo,
  hasCustomer,
  lines,
}: {
  invoiceId: string;
  invoiceNo: string;
  hasCustomer: boolean;
  lines: ReturnLineView[];
}) {
  const router = useRouter();
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [restocked, setRestocked] = useState<"yes" | "no">("yes");
  const [refundMode, setRefundMode] = useState<string>(hasCustomer ? "ledger_adjustment" : "cash");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Previewed with the same function the server uses, so the figure on screen
  // is the figure that gets written — not an approximation of it.
  const preview = useMemo(() => computeCreditNote(lines, qtys), [lines, qtys]);

  const anySelected = preview.lines.length > 0;

  function setQty(invoiceItemId: string, value: string, max: number) {
    const n = Math.max(0, Math.min(max, Math.floor(Number(value) || 0)));
    setQtys((current) => ({ ...current, [invoiceItemId]: n }));
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await createCreditNote(invoiceId, {
        reason,
        restocked: restocked === "yes",
        refundMode: refundMode as "cash" | "upi" | "card" | "ledger_adjustment",
        lines: Object.entries(qtys).map(([invoiceItemId, qty]) => ({ invoiceItemId, qty })),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success(`Credit note ${res.creditNoteNo} raised — ₹${res.total.toFixed(2)}`);
      router.push(`/credit-notes/${res.creditNoteId}`);
    });
  }

  return (
    <div className="max-w-4xl space-y-5">
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Batch</TableHead>
              <TableHead className="text-right">Sold</TableHead>
              <TableHead className="text-right">Already returned</TableHead>
              <TableHead className="w-28 text-right">Return now</TableHead>
              <TableHead className="text-right">Credit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line) => {
              const isScheduleX = line.scheduleClass === "X";
              const credited = preview.lines.find((l) => l.invoiceItemId === line.invoiceItemId);
              return (
                <TableRow key={line.invoiceItemId}>
                  <TableCell className="font-medium">
                    {line.itemName}
                    {isScheduleX && (
                      <Badge variant="outline" className="ml-2 text-[9px] text-destructive">
                        Schedule X — not returnable here
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{line.batchNo}</TableCell>
                  <TableCell className="text-right tabular-nums">{line.soldQty}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {line.returnedQty}
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={0}
                      max={line.remainingQty}
                      aria-label={`Return quantity for ${line.itemName}`}
                      value={qtys[line.invoiceItemId] ?? 0}
                      disabled={pending || line.remainingQty === 0 || isScheduleX}
                      onChange={(e) => setQty(line.invoiceItemId, e.target.value, line.remainingQty)}
                      className="h-8 text-right tabular-nums"
                    />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {credited ? `₹${credited.lineTotal.toFixed(2)}` : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Condition of the returned goods</Label>
          <Select value={restocked} onValueChange={(v) => setRestocked(v as "yes" | "no")}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="yes">Resalable — put back into stock</SelectItem>
              <SelectItem value="no">Damaged / not resalable — write off</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {restocked === "yes"
              ? "The units go back to their original batch and can be dispensed again."
              : "The customer is still credited in full; the stock is written off and never re-enters sellable stock."}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">How the money goes back</Label>
          <Select value={refundMode} onValueChange={setRefundMode}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="upi">UPI</SelectItem>
              <SelectItem value="card">Card</SelectItem>
              <SelectItem value="ledger_adjustment" disabled={!hasCustomer}>
                Adjust against customer account
              </SelectItem>
            </SelectContent>
          </Select>
          {!hasCustomer && (
            <p className="text-xs text-muted-foreground">
              This was a walk-in sale, so there is no account to adjust.
            </p>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="credit-reason" className="text-xs">
          Reason (appears on the credit note and in the audit log)
        </Label>
        <Textarea
          id="credit-reason"
          rows={2}
          value={reason}
          disabled={pending}
          placeholder="e.g. Customer returned two unopened strips — wrong strength dispensed"
          onChange={(e) => setReason(e.target.value)}
        />
      </div>

      <div className="flex items-end justify-between rounded-lg border bg-muted/30 p-4">
        <div className="space-y-0.5 text-sm">
          <div className="flex gap-6">
            <span className="text-muted-foreground">Taxable value</span>
            <span className="tabular-nums">₹{preview.subtotal.toFixed(2)}</span>
          </div>
          <div className="flex gap-6">
            <span className="text-muted-foreground">CGST + SGST</span>
            <span className="tabular-nums">₹{preview.taxAmount.toFixed(2)}</span>
          </div>
          <div className="flex gap-6 font-semibold">
            <span>Credit total</span>
            <span className="tabular-nums">₹{preview.total.toFixed(2)}</span>
          </div>
        </div>
        <Button
          disabled={pending || !anySelected || reason.trim().length < 5}
          onClick={submit}
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          Raise credit note for {invoiceNo}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
