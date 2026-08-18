"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cancelInvoice } from "@/lib/actions/invoice-cancellation";
import { AlertCircle, Ban, Loader2 } from "lucide-react";
import { toast } from "sonner";

/**
 * Voids a sale. Deliberately a two-step confirmation with a typed reason
 * rather than a single click: it puts stock back on the shelf and stops a tax
 * invoice counting, and there is no undo.
 */
export function CancelInvoiceButton({
  invoiceId,
  invoiceNo,
  total,
  itemCount,
}: {
  invoiceId: string;
  invoiceNo: string;
  total: number;
  itemCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await cancelInvoice(invoiceId, { reason });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      setReason("");
      toast.success(`Invoice ${res.invoiceNo} cancelled — stock restored`);
      router.refresh();
    });
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Ban className="h-4 w-4" /> Cancel bill
      </Button>

      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel invoice {invoiceNo}?</DialogTitle>
            <DialogDescription>
              This puts {itemCount} {itemCount === 1 ? "line" : "lines"} of stock back on the
              shelf and removes ₹{total.toFixed(2)} from today&apos;s sales. The invoice number
              stays in the series, marked cancelled. This cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="cancel-reason" className="text-xs">
              Reason (recorded in the audit log)
            </Label>
            <Textarea
              id="cancel-reason"
              rows={3}
              value={reason}
              disabled={pending}
              placeholder="e.g. Wrong item billed — customer wanted the 650mg strip"
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
              Keep the bill
            </Button>
            <Button variant="destructive" disabled={pending || reason.trim().length < 5} onClick={submit}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Cancel invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
