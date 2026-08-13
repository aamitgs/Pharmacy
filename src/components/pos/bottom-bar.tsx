"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { BillingResult } from "@/lib/billing";
import type { PosCustomer } from "./types";
import type { PaymentMode } from "@/generated/prisma/client";
import { Loader2 } from "lucide-react";

const PAYMENT_MODES: { value: PaymentMode; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
  { value: "credit", label: "Credit" },
];

export function BottomBar({
  billing,
  billDiscountValue,
  billDiscountIsPercent,
  onBillDiscountChange,
  customers,
  customerId,
  onCustomerChange,
  paymentMode,
  onPaymentModeChange,
  onCompleteSale,
  submitting,
  blockedReason,
}: {
  billing: BillingResult;
  billDiscountValue: number;
  billDiscountIsPercent: boolean;
  onBillDiscountChange: (value: number, isPercent: boolean) => void;
  customers: PosCustomer[];
  customerId: string | null;
  onCustomerChange: (id: string | null) => void;
  paymentMode: PaymentMode;
  onPaymentModeChange: (mode: PaymentMode) => void;
  onCompleteSale: () => void;
  submitting: boolean;
  blockedReason: string | null;
}) {
  const selectedCustomer = customers.find((c) => c.id === customerId);
  const creditEligible = !!selectedCustomer && selectedCustomer.creditLimit !== null;

  return (
    <div className="sticky bottom-0 z-30 border-t bg-card shadow-[0_-2px_8px_rgba(0,0,0,0.04)]">
      <div className="grid grid-cols-[1fr_auto] gap-6 p-4">
        <div className="grid grid-cols-4 gap-4">
          <div className="space-y-1">
            <Label className="text-xs">Customer (optional)</Label>
            <Select
              value={customerId ?? "__none"}
              onValueChange={(v) => onCustomerChange(v === "__none" ? null : v)}
            >
              <SelectTrigger className="h-8">
                <SelectValue placeholder="Walk-in" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Walk-in</SelectItem>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} {c.phone ? `· ${c.phone}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Bill discount</Label>
            <div className="flex gap-1">
              <Input
                type="number"
                min={0}
                className="h-8"
                value={billDiscountValue}
                onChange={(e) => onBillDiscountChange(Number(e.target.value), billDiscountIsPercent)}
              />
              <Select
                value={billDiscountIsPercent ? "percent" : "amount"}
                onValueChange={(v) => onBillDiscountChange(billDiscountValue, v === "percent")}
              >
                <SelectTrigger className="h-8 w-14">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">%</SelectItem>
                  <SelectItem value="amount">₹</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="col-span-2 space-y-1">
            <Label className="text-xs">Payment mode</Label>
            <div className="flex gap-1">
              {PAYMENT_MODES.map((m) => {
                const disabled = m.value === "credit" && !creditEligible;
                return (
                  <Button
                    key={m.value}
                    type="button"
                    size="sm"
                    variant={paymentMode === m.value ? "default" : "outline"}
                    disabled={disabled}
                    onClick={() => onPaymentModeChange(m.value)}
                    title={disabled ? "Select a customer with a credit account first" : undefined}
                  >
                    {m.label}
                  </Button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right text-xs text-muted-foreground">
            <div>
              Subtotal <span className="tabular-nums">₹{billing.subtotal.toFixed(2)}</span>
            </div>
            <div>
              Discount{" "}
              <span className="tabular-nums text-success">
                −₹{billing.discountAmount.toFixed(2)}
              </span>
            </div>
            <div>
              Tax (CGST+SGST) <span className="tabular-nums">₹{billing.taxAmount.toFixed(2)}</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Total</div>
            <div className="text-2xl font-semibold tabular-nums">₹{billing.total.toFixed(2)}</div>
          </div>
          <Button
            size="lg"
            className="h-14 px-6"
            onClick={onCompleteSale}
            disabled={submitting || !!blockedReason}
            title={blockedReason ?? undefined}
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Complete sale
            <kbd className="ml-2 hidden rounded bg-primary-foreground/20 px-1.5 py-0.5 text-[10px] sm:inline">
              F9
            </kbd>
          </Button>
        </div>
      </div>
      {blockedReason && (
        <div className={cn("border-t px-4 py-1.5 text-xs text-destructive")}>{blockedReason}</div>
      )}
    </div>
  );
}
