"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";
import { dispenseToAdmission, returnDispense } from "@/lib/actions/admissions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2 } from "lucide-react";

interface AvailableBatch {
  id: string;
  itemId: string;
  itemName: string;
  unit: string;
  scheduleClass: string;
  batchNo: string;
  expiryDate: Date;
  currentQty: number;
}

interface DispenseRow {
  id: string;
  itemName: string;
  unit: string;
  batchNo: string;
  qty: number;
  returnedQty: number;
  dispensedByName: string;
  dispensedAt: Date;
}

/**
 * Ward-terminal screen: dispense and return live on the same page, kept as
 * fast/keyboard-friendly as the retail POS — a nurse under time pressure
 * shouldn't have to navigate away to log a return.
 */
export function AdmissionDetail({
  admissionId,
  discharged,
  availableBatches,
  initialDispenses,
}: {
  admissionId: string;
  discharged: boolean;
  availableBatches: AvailableBatch[];
  initialDispenses: DispenseRow[];
}) {
  const router = useRouter();
  const [dispenses, setDispenses] = useState(initialDispenses);
  const [query, setQuery] = useState("");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [batchId, setBatchId] = useState("");
  const [qty, setQty] = useState(1);
  const [dispensing, setDispensing] = useState(false);
  const [returnQty, setReturnQty] = useState<Record<string, number>>({});
  const [returningId, setReturningId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const itemNames = useMemo(() => {
    const seen = new Map<string, { itemId: string; itemName: string }>();
    for (const b of availableBatches) if (!seen.has(b.itemId)) seen.set(b.itemId, { itemId: b.itemId, itemName: b.itemName });
    return [...seen.values()];
  }, [availableBatches]);

  const matches = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.trim().toLowerCase();
    return itemNames.filter((i) => i.itemName.toLowerCase().includes(q)).slice(0, 8);
  }, [query, itemNames]);

  const batchesForSelectedItem = useMemo(
    () => availableBatches.filter((b) => b.itemId === selectedItemId),
    [availableBatches, selectedItemId]
  );

  function selectItem(itemId: string, itemName: string) {
    setSelectedItemId(itemId);
    setQuery(itemName);
    const first = availableBatches.find((b) => b.itemId === itemId);
    setBatchId(first?.id ?? "");
    setQty(1);
  }

  async function dispense() {
    if (!batchId) {
      toast.error("Pick an item with available ward stock.");
      return;
    }
    setDispensing(true);
    try {
      const result = await dispenseToAdmission({ admissionId, batchId, qty });
      const batch = availableBatches.find((b) => b.id === batchId)!;
      setDispenses((d) => [
        {
          id: result.id,
          itemName: batch.itemName,
          unit: batch.unit,
          batchNo: batch.batchNo,
          qty,
          returnedQty: 0,
          dispensedByName: "You",
          dispensedAt: new Date(),
        },
        ...d,
      ]);
      setQuery("");
      setSelectedItemId(null);
      setBatchId("");
      setQty(1);
      toast.success("Dispensed");
      inputRef.current?.focus();
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not dispense");
    } finally {
      setDispensing(false);
    }
  }

  async function returnQtyFor(dispenseId: string, remainder: number) {
    const amount = returnQty[dispenseId] ?? remainder;
    if (amount <= 0 || amount > remainder) {
      toast.error(`Enter a quantity up to ${remainder}.`);
      return;
    }
    setReturningId(dispenseId);
    try {
      await returnDispense({ dispenseId, qty: amount });
      setDispenses((d) => d.map((x) => (x.id === dispenseId ? { ...x, returnedQty: x.returnedQty + amount } : x)));
      toast.success("Returned to ward stock");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not return");
    } finally {
      setReturningId(null);
    }
  }

  return (
    <div className="space-y-8">
      {!discharged && (
        <div className="max-w-xl space-y-3">
          <Label htmlFor="dispenseItemSearch">Dispense</Label>
          <div className="relative">
            <Input
              id="dispenseItemSearch"
              ref={inputRef}
              autoFocus
              placeholder="Type an item name..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedItemId(null);
                setBatchId("");
              }}
            />
            {matches.length > 0 && !selectedItemId && (
              <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow-md">
                {matches.map((m) => (
                  <button
                    key={m.itemId}
                    type="button"
                    className="block w-full px-3 py-1.5 text-left text-sm hover:bg-accent"
                    onClick={() => selectItem(m.itemId, m.itemName)}
                  >
                    {m.itemName}
                  </button>
                ))}
              </div>
            )}
          </div>
          {selectedItemId && (
            <div className="flex items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="dispenseBatch">Batch (FEFO)</Label>
                <Select value={batchId} onValueChange={setBatchId}>
                  <SelectTrigger id="dispenseBatch" className="h-9 w-64">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {batchesForSelectedItem.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.batchNo} · exp {format(b.expiryDate, "MMM yyyy")} · qty {b.currentQty}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dispenseQty">Qty</Label>
                <Input id="dispenseQty" type="number" min={1} className="h-9 w-20" value={qty} onChange={(e) => setQty(Number(e.target.value))} />
              </div>
              <Button onClick={dispense} disabled={dispensing}>
                {dispensing && <Loader2 className="h-4 w-4 animate-spin" />}
                Dispense
              </Button>
            </div>
          )}
        </div>
      )}

      <div>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Dispense history</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Batch</TableHead>
              <TableHead>Qty</TableHead>
              <TableHead>Returned</TableHead>
              <TableHead>By</TableHead>
              <TableHead>When</TableHead>
              <TableHead className="w-56">Return</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dispenses.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                  No dispenses yet.
                </TableCell>
              </TableRow>
            )}
            {dispenses.map((d) => {
              const remainder = d.qty - d.returnedQty;
              return (
                <TableRow key={d.id}>
                  <TableCell>
                    {d.itemName} <span className="text-xs text-muted-foreground">({d.unit})</span>
                  </TableCell>
                  <TableCell>{d.batchNo}</TableCell>
                  <TableCell>{d.qty}</TableCell>
                  <TableCell>{d.returnedQty > 0 ? <Badge variant="outline">{d.returnedQty}</Badge> : "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{d.dispensedByName}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{format(d.dispensedAt, "dd MMM, HH:mm")}</TableCell>
                  <TableCell>
                    {remainder > 0 ? (
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="number"
                          min={1}
                          max={remainder}
                          className="h-8 w-16"
                          value={returnQty[d.id] ?? remainder}
                          onChange={(e) => setReturnQty((r) => ({ ...r, [d.id]: Number(e.target.value) }))}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={returningId === d.id}
                          onClick={() => returnQtyFor(d.id, remainder)}
                        >
                          {returningId === d.id && <Loader2 className="h-4 w-4 animate-spin" />}
                          Return
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Fully returned</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
