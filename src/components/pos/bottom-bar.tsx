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
import type { AppliedCoupon } from "@/store/cart-store";
import type { PosCustomer } from "./types";
import type { PaymentMode } from "@/generated/prisma/client";
import { Loader2, Tag, X } from "lucide-react";

const PAYMENT_MODES: { value: PaymentMode; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
  { value: "credit", label: "Credit" },
  { value: "insurance", label: "Insurance" },
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
  appliedCoupon,
  couponInput,
  onCouponInputChange,
  onApplyCoupon,
  onRemoveCoupon,
  couponError,
  couponChecking,
  insuranceProviders,
  insuranceProviderId,
  onInsuranceProviderChange,
  claimNumber,
  onClaimNumberChange,
  coPayAmount,
  onCoPayAmountChange,
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
  appliedCoupon: AppliedCoupon | null;
  couponInput: string;
  onCouponInputChange: (v: string) => void;
  onApplyCoupon: () => void;
  onRemoveCoupon: () => void;
  couponError: string | null;
  couponChecking: boolean;
  insuranceProviders: { id: string; name: string }[];
  insuranceProviderId: string | null;
  onInsuranceProviderChange: (id: string | null) => void;
  claimNumber: string;
  onClaimNumberChange: (v: string) => void;
  coPayAmount: string;
  onCoPayAmountChange: (v: string) => void;
}) {
  const selectedCustomer = customers.find((c) => c.id === customerId);
  const creditEligible = !!selectedCustomer && selectedCustomer.creditLimit !== null;
  const loyaltyDiscount = billing.billDiscounts.find((d) => d.type === "loyalty");
  const couponDiscount = billing.billDiscounts.find((d) => d.type === "coupon");

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
            {selectedCustomer?.loyaltyTierName && (
              <p className="text-[11px] text-success">
                {selectedCustomer.loyaltyTierName} tier — {selectedCustomer.loyaltyDiscountPercent}% loyalty discount
              </p>
            )}
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

          {paymentMode === "insurance" && (
            <div className="col-span-4 grid grid-cols-3 gap-2 rounded-md border bg-muted/20 p-2">
              <div className="space-y-1">
                <Label className="text-xs">Insurance provider</Label>
                <Select
                  value={insuranceProviderId ?? "__none"}
                  onValueChange={(v) => onInsuranceProviderChange(v === "__none" ? null : v)}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="Select provider" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none" disabled>
                      Select provider
                    </SelectItem>
                    {insuranceProviders.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="claimNumber" className="text-xs">
                  Claim number (optional)
                </Label>
                <Input
                  id="claimNumber"
                  className="h-8"
                  value={claimNumber}
                  onChange={(e) => onClaimNumberChange(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="coPayAmount" className="text-xs">
                  Co-pay collected now (₹)
                </Label>
                <Input
                  id="coPayAmount"
                  type="number"
                  min={0}
                  className="h-8"
                  value={coPayAmount}
                  onChange={(e) => onCoPayAmountChange(e.target.value)}
                  placeholder="0 — fully cashless"
                />
              </div>
            </div>
          )}

          <div className="col-span-4 space-y-1">
            <Label className="text-xs">Coupon code</Label>
            {appliedCoupon ? (
              <div className="flex h-8 items-center justify-between rounded-md border bg-success/10 px-2 text-xs">
                <span className="flex items-center gap-1 text-success">
                  <Tag className="h-3 w-3" /> {appliedCoupon.code} applied
                </span>
                <button type="button" onClick={onRemoveCoupon} aria-label="Remove coupon">
                  <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                </button>
              </div>
            ) : (
              <div className="flex gap-1">
                <Input
                  className="h-8 uppercase"
                  placeholder="Enter code"
                  value={couponInput}
                  onChange={(e) => onCouponInputChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      onApplyCoupon();
                    }
                  }}
                />
                <Button type="button" size="sm" className="h-8" onClick={onApplyCoupon} disabled={couponChecking}>
                  Apply
                </Button>
              </div>
            )}
            {couponError && <p className="text-[11px] text-destructive">{couponError}</p>}
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
            {loyaltyDiscount && loyaltyDiscount.amount > 0 && (
              <div>
                &nbsp;&nbsp;· Loyalty{" "}
                <span className="tabular-nums text-success">−₹{loyaltyDiscount.amount.toFixed(2)}</span>
              </div>
            )}
            {couponDiscount && couponDiscount.amount > 0 && (
              <div>
                &nbsp;&nbsp;· Coupon{" "}
                <span className="tabular-nums text-success">−₹{couponDiscount.amount.toFixed(2)}</span>
              </div>
            )}
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
