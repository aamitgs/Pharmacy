"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { createIndent } from "@/lib/actions/indents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { X } from "lucide-react";

interface CartLine {
  itemId: string;
  itemName: string;
  unit: string;
  qty: number;
}

/**
 * Ward-side indent request — a nurse types an item name, hits Enter to add
 * it to the cart at qty 1, then adjusts quantities and submits. No batch
 * picking (that's the central pharmacy's job at issue time) — kept as fast
 * as the retail POS's own item-add flow, just without pricing.
 */
export function IndentRequestForm({
  wards,
  items,
  onSubmitted,
}: {
  wards: { id: string; name: string }[];
  items: { id: string; name: string; unit: string }[];
  onSubmitted?: () => void;
}) {
  const [wardId, setWardId] = useState(wards[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.trim().toLowerCase();
    return items.filter((i) => i.name.toLowerCase().includes(q)).slice(0, 8);
  }, [query, items]);

  function addItem(item: { id: string; name: string; unit: string }) {
    setCart((c) => {
      const existing = c.find((l) => l.itemId === item.id);
      if (existing) return c.map((l) => (l.itemId === item.id ? { ...l, qty: l.qty + 1 } : l));
      return [...c, { itemId: item.id, itemName: item.name, unit: item.unit, qty: 1 }];
    });
    setQuery("");
    inputRef.current?.focus();
  }

  function onQueryKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && matches.length > 0) {
      e.preventDefault();
      addItem(matches[0]);
    }
  }

  function updateQty(itemId: string, qty: number) {
    setCart((c) => c.map((l) => (l.itemId === itemId ? { ...l, qty: Math.max(1, qty) } : l)));
  }

  function removeLine(itemId: string) {
    setCart((c) => c.filter((l) => l.itemId !== itemId));
  }

  async function submit() {
    if (!wardId) {
      toast.error("No ward available to request for.");
      return;
    }
    if (cart.length === 0) {
      toast.error("Add at least one item.");
      return;
    }
    setSubmitting(true);
    try {
      await createIndent({
        wardId,
        items: cart.map((l) => ({ itemId: l.itemId, qtyRequested: l.qty })),
      });
      toast.success("Indent submitted");
      setCart([]);
      onSubmitted?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not submit indent");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      {wards.length > 1 && (
        <div className="space-y-1.5">
          <Label htmlFor="indentWard">Ward</Label>
          <Select value={wardId} onValueChange={setWardId}>
            <SelectTrigger id="indentWard" className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {wards.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {wards.length === 0 && (
        <p className="text-sm text-muted-foreground">You are not assigned to any ward yet.</p>
      )}

      <div className="relative space-y-1.5">
        <Label htmlFor="indentItemSearch">Add item</Label>
        <Input
          id="indentItemSearch"
          ref={inputRef}
          autoFocus
          placeholder="Type an item name, Enter to add..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onQueryKeyDown}
        />
        {matches.length > 0 && (
          <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow-md">
            {matches.map((m) => (
              <button
                key={m.id}
                type="button"
                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-accent"
                onClick={() => addItem(m)}
              >
                {m.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item</TableHead>
            <TableHead className="w-28">Qty</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {cart.length === 0 && (
            <TableRow>
              <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                No items added yet.
              </TableCell>
            </TableRow>
          )}
          {cart.map((line) => (
            <TableRow key={line.itemId}>
              <TableCell>
                {line.itemName} <span className="text-xs text-muted-foreground">({line.unit})</span>
              </TableCell>
              <TableCell>
                <Input
                  type="number"
                  min={1}
                  className="h-8 w-20"
                  value={line.qty}
                  onChange={(e) => updateQty(line.itemId, Number(e.target.value))}
                />
              </TableCell>
              <TableCell>
                <Button size="icon" variant="ghost" onClick={() => removeLine(line.itemId)}>
                  <X className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Button onClick={submit} disabled={submitting || cart.length === 0}>
        Submit indent
      </Button>
    </div>
  );
}
