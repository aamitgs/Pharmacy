"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { updateInsuranceClaimStatus } from "@/lib/actions/insurance-claims";
import { Check, RotateCcw, X } from "lucide-react";

export function InsuranceClaimStatusActions({
  claimId,
  status,
  claimedAmount,
}: {
  claimId: string;
  status: "pending" | "approved" | "rejected" | "settled";
  claimedAmount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [settleOpen, setSettleOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [settledAmount, setSettledAmount] = useState(String(claimedAmount));
  const [rejectionReason, setRejectionReason] = useState("");

  function run(input: Parameters<typeof updateInsuranceClaimStatus>[1]) {
    startTransition(async () => {
      try {
        await updateInsuranceClaimStatus(claimId, input);
        toast.success("Claim updated");
        setSettleOpen(false);
        setRejectOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  if (status === "settled") {
    return <p className="text-sm text-muted-foreground">This claim is settled — no further action.</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {status === "pending" && (
        <Button size="sm" disabled={pending} onClick={() => run({ status: "approved" })}>
          <Check className="h-4 w-4" /> Mark approved
        </Button>
      )}

      {status === "approved" && (
        <Dialog open={settleOpen} onOpenChange={setSettleOpen}>
          <DialogTrigger asChild>
            <Button size="sm" disabled={pending}>
              <Check className="h-4 w-4" /> Mark settled
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Settle this claim</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="settledAmount">Amount actually paid by the insurer (₹)</Label>
                <Input
                  id="settledAmount"
                  type="number"
                  step="0.01"
                  autoFocus
                  value={settledAmount}
                  onChange={(e) => setSettledAmount(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Claimed: ₹{claimedAmount.toFixed(2)}</p>
              </div>
              <Button
                disabled={pending || !settledAmount}
                onClick={() => run({ status: "settled", settledAmount: Number(settledAmount) })}
              >
                Confirm settlement
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {(status === "pending" || status === "approved") && (
        <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" disabled={pending}>
              <X className="h-4 w-4" /> Reject
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reject this claim</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="rejectionReason">Reason</Label>
                <Input
                  id="rejectionReason"
                  autoFocus
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="e.g. Policy lapsed, documentation incomplete"
                />
              </div>
              <Button
                variant="destructive"
                disabled={pending || !rejectionReason.trim()}
                onClick={() => run({ status: "rejected", rejectionReason: rejectionReason.trim() })}
              >
                Confirm rejection
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {status === "rejected" && (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run({ status: "pending" })}>
          <RotateCcw className="h-4 w-4" /> Resubmit
        </Button>
      )}
    </div>
  );
}
