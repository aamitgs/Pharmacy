"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";
import { getIndentDetail, issueIndent, rejectIndent } from "@/lib/actions/indents";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2 } from "lucide-react";

interface IndentRow {
  id: string;
  wardId: string;
  wardName: string;
  status: string;
  createdAt: Date;
  requestedByName: string;
  approvedByName: string | null;
  items: { itemName: string; unit: string; qtyRequested: number; qtyIssued: number }[];
}

const STATUS_VARIANT: Record<string, "default" | "outline" | "destructive" | "secondary"> = {
  pending: "default",
  issued: "secondary",
  partially_issued: "outline",
  rejected: "destructive",
};

type DetailLine = {
  id: string;
  itemId: string;
  itemName: string;
  unit: string;
  qtyRequested: number;
  qtyIssued: number;
  issuedBatchNo: string | null;
  availableBatches: { id: string; batchNo: string; expiryDate: Date; currentQty: number }[];
};

/** Central pharmacy's approval queue — prioritizes clarity (what's
 * requested, current stock, who/when) over raw speed, per the design
 * direction: this is a pharmacist reviewing multiple requests, not a
 * ward terminal under time pressure. */
export function IndentApprovalQueue({ initialIndents }: { initialIndents: IndentRow[] }) {
  const router = useRouter();
  const [indents, setIndents] = useState(initialIndents);
  const [openIndentId, setOpenIndentId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ id: string; wardName: string; requestedByName: string; items: DetailLine[] } | null>(null);
  const [decisions, setDecisions] = useState<Record<string, { qty: number; batchId: string }>>({});
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [pending, startTransition] = useTransition();

  const pendingIndents = indents.filter((i) => i.status === "pending");
  const decidedIndents = indents.filter((i) => i.status !== "pending");

  async function openDetail(indentId: string) {
    setOpenIndentId(indentId);
    setLoadingDetail(true);
    try {
      const d = await getIndentDetail(indentId);
      setDetail(d);
      const initial: Record<string, { qty: number; batchId: string }> = {};
      for (const line of d.items) {
        initial[line.id] = {
          qty: Math.min(line.qtyRequested, line.availableBatches[0]?.currentQty ?? 0),
          batchId: line.availableBatches[0]?.id ?? "",
        };
      }
      setDecisions(initial);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load indent");
      setOpenIndentId(null);
    } finally {
      setLoadingDetail(false);
    }
  }

  function close() {
    setOpenIndentId(null);
    setDetail(null);
    setDecisions({});
  }

  function issue() {
    if (!detail) return;
    startTransition(async () => {
      try {
        await issueIndent({
          indentId: detail.id,
          decisions: Object.entries(decisions).map(([indentItemId, d]) => ({
            indentItemId,
            qtyIssued: d.qty,
            batchId: d.batchId || undefined,
          })),
        });
        toast.success("Indent issued");
        setIndents((list) => list.filter((i) => i.id !== detail.id));
        close();
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not issue indent");
      }
    });
  }

  function reject() {
    if (!detail) return;
    startTransition(async () => {
      try {
        await rejectIndent(detail.id);
        toast.success("Indent rejected");
        setIndents((list) => list.filter((i) => i.id !== detail.id));
        close();
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not reject indent");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-2 text-sm font-medium text-muted-foreground">Pending ({pendingIndents.length})</h3>
        <IndentTable rows={pendingIndents} onOpen={openDetail} />
      </div>
      {decidedIndents.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">Recently decided</h3>
          <IndentTable rows={decidedIndents.slice(0, 20)} onOpen={openDetail} />
        </div>
      )}

      <Dialog open={openIndentId !== null} onOpenChange={(open) => !open && close()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Indent — {detail?.wardName ?? ""}</DialogTitle>
          </DialogHeader>
          {loadingDetail && <Loader2 className="h-5 w-5 animate-spin" />}
          {detail && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">Requested by {detail.requestedByName}</p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="w-20">Req.</TableHead>
                    <TableHead className="w-44">Batch (FEFO)</TableHead>
                    <TableHead className="w-24">Issue qty</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.items.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell>
                        {line.itemName} <span className="text-xs text-muted-foreground">({line.unit})</span>
                      </TableCell>
                      <TableCell>{line.qtyRequested}</TableCell>
                      <TableCell>
                        {line.availableBatches.length === 0 ? (
                          <span className="text-xs text-destructive">No central stock</span>
                        ) : (
                          <Select
                            value={decisions[line.id]?.batchId ?? ""}
                            onValueChange={(v) => setDecisions((d) => ({ ...d, [line.id]: { ...d[line.id], batchId: v } }))}
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {line.availableBatches.map((b) => (
                                <SelectItem key={b.id} value={b.id}>
                                  {b.batchNo} · exp {format(b.expiryDate, "MMM yyyy")} · qty {b.currentQty}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          max={line.qtyRequested}
                          className="h-8"
                          value={decisions[line.id]?.qty ?? 0}
                          onChange={(e) =>
                            setDecisions((d) => ({ ...d, [line.id]: { ...d[line.id], qty: Number(e.target.value) } }))
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <DialogFooter>
            <Button variant="destructive" disabled={pending} onClick={reject}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Reject
            </Button>
            <Button disabled={pending} onClick={issue}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Issue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function IndentTable({ rows, onOpen }: { rows: IndentRow[]; onOpen: (id: string) => void }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Ward</TableHead>
          <TableHead>Requested by</TableHead>
          <TableHead>Items</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>When</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 && (
          <TableRow>
            <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
              Nothing here.
            </TableCell>
          </TableRow>
        )}
        {rows.map((i) => (
          <TableRow key={i.id} className="cursor-pointer" onClick={() => onOpen(i.id)}>
            <TableCell>{i.wardName}</TableCell>
            <TableCell>{i.requestedByName}</TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {i.items.map((l) => `${l.itemName} ×${l.qtyRequested}`).join(", ")}
            </TableCell>
            <TableCell>
              <Badge variant={STATUS_VARIANT[i.status] ?? "outline"}>{i.status.replace("_", " ")}</Badge>
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">{format(i.createdAt, "dd MMM, HH:mm")}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
