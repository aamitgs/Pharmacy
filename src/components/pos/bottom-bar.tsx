"use client";

import { useLocale, useTranslations } from "next-intl";
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
import { formatCurrency } from "@/lib/format";
import type { AppLocale } from "@/i18n/locales";
import type { BillingResult } from "@/lib/billing";
import type { AppliedCoupon } from "@/store/cart-store";
import type { PosCustomer } from "./types";
import type { PaymentMode } from "@/generated/prisma/client";
import { Loader2, Tag, X } from "lucide-react";

const PAYMENT_MODES: { value: PaymentMode; labelKey: string }[] = [
  { value: "cash", labelKey: "paymentCash" },
  { value: "upi", labelKey: "paymentUpi" },
  { value: "card", labelKey: "paymentCard" },
  { value: "credit", labelKey: "paymentCredit" },
  { value: "insurance", labelKey: "paymentInsurance" },
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
  const t = useTranslations("pos.bottomBar");
  const locale = useLocale() as AppLocale;
  const selectedCustomer = customers.find((c) => c.id === customerId);
  const creditEligible = !!selectedCustomer && selectedCustomer.creditLimit !== null;
  const loyaltyDiscount = billing.billDiscounts.find((d) => d.type === "loyalty");
  const couponDiscount = billing.billDiscounts.find((d) => d.type === "coupon");

  return (
    <div className="sticky bottom-0 z-30 border-t bg-card shadow-[0_-2px_8px_rgba(0,0,0,0.04)]">
      <div className="grid grid-cols-[1fr_auto] gap-6 p-4">
        <div className="grid grid-cols-4 gap-4">
          <div className="space-y-1">
            <Label className="text-xs">{t("customerOptional")}</Label>
            <Select
              value={customerId ?? "__none"}
              onValueChange={(v) => onCustomerChange(v === "__none" ? null : v)}
            >
              <SelectTrigger className="h-8">
                <SelectValue placeholder={t("walkIn")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">{t("walkIn")}</SelectItem>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} {c.phone ? `· ${c.phone}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedCustomer?.loyaltyTierName && (
              <p className="text-[11px] text-success">
                {t("loyaltyDiscountLine", {
                  tier: selectedCustomer.loyaltyTierName,
                  percent: selectedCustomer.loyaltyDiscountPercent,
                })}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label className="text-xs">{t("billDiscount")}</Label>
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
            <Label className="text-xs">{t("paymentMode")}</Label>
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
                    title={disabled ? t("creditRequiresCustomer") : undefined}
                  >
                    {t(m.labelKey)}
                  </Button>
                );
              })}
            </div>
          </div>

          {paymentMode === "insurance" && (
            <div className="col-span-4 grid grid-cols-3 gap-2 rounded-md border bg-muted/20 p-2">
              <div className="space-y-1">
                <Label className="text-xs">{t("insuranceProvider")}</Label>
                <Select
                  value={insuranceProviderId ?? "__none"}
                  onValueChange={(v) => onInsuranceProviderChange(v === "__none" ? null : v)}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder={t("selectProvider")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none" disabled>
                      {t("selectProvider")}
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
                  {t("claimNumberOptional")}
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
                  {t("coPayCollectedNow")}
                </Label>
                <Input
                  id="coPayAmount"
                  type="number"
                  min={0}
                  className="h-8"
                  value={coPayAmount}
                  onChange={(e) => onCoPayAmountChange(e.target.value)}
                  placeholder={t("coPayPlaceholder")}
                />
              </div>
            </div>
          )}

          <div className="col-span-4 space-y-1">
            <Label className="text-xs">{t("couponCode")}</Label>
            {appliedCoupon ? (
              <div className="flex h-8 items-center justify-between rounded-md border bg-success/10 px-2 text-xs">
                <span className="flex items-center gap-1 text-success">
                  <Tag className="h-3 w-3" /> {t("couponApplied", { code: appliedCoupon.code })}
                </span>
                <button type="button" onClick={onRemoveCoupon} aria-label={t("removeCoupon")}>
                  <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                </button>
              </div>
            ) : (
              <div className="flex gap-1">
                <Input
                  className="h-8 uppercase"
                  placeholder={t("enterCode")}
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
                  {t("apply")}
                </Button>
              </div>
            )}
            {couponError && <p className="text-[11px] text-destructive">{couponError}</p>}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right text-xs text-muted-foreground">
            <div>
              {t("subtotal")} <span className="tabular-nums">{formatCurrency(billing.subtotal, locale)}</span>
            </div>
            <div>
              {t("discount")}{" "}
              <span className="tabular-nums text-success">
                −{formatCurrency(billing.discountAmount, locale)}
              </span>
            </div>
            {loyaltyDiscount && loyaltyDiscount.amount > 0 && (
              <div>
                &nbsp;&nbsp;· {t("loyalty")}{" "}
                <span className="tabular-nums text-success">−{formatCurrency(loyaltyDiscount.amount, locale)}</span>
              </div>
            )}
            {couponDiscount && couponDiscount.amount > 0 && (
              <div>
                &nbsp;&nbsp;· {t("coupon")}{" "}
                <span className="tabular-nums text-success">−{formatCurrency(couponDiscount.amount, locale)}</span>
              </div>
            )}
            <div>
              {t("taxCgstSgst")} <span className="tabular-nums">{formatCurrency(billing.taxAmount, locale)}</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">{t("total")}</div>
            <div className="text-2xl font-semibold tabular-nums">{formatCurrency(billing.total, locale)}</div>
          </div>
          <Button
            size="lg"
            className="h-14 px-6"
            onClick={onCompleteSale}
            disabled={submitting || !!blockedReason}
            title={blockedReason ?? undefined}
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("completeSale")}
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
