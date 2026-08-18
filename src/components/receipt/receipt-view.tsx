"use client";

import { format } from "date-fns";
import { useLocale, useTranslations } from "next-intl";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AppLocale } from "@/i18n/locales";
import type { ReceiptData } from "@/lib/actions/invoices";

const PAYMENT_LABEL_KEYS: Record<string, string> = {
  cash: "paymentCash",
  upi: "paymentUpi",
  card: "paymentCard",
  credit: "paymentCredit",
  insurance: "paymentInsurance",
};

export function ReceiptView({ data, isThermal = true }: { data: ReceiptData; isThermal?: boolean }) {
  const t = useTranslations("receipt");
  const locale = useLocale() as AppLocale;
  const paymentLabel = PAYMENT_LABEL_KEYS[data.paymentMode] ? t(PAYMENT_LABEL_KEYS[data.paymentMode]) : data.paymentMode;

  return (
    <div
      id="receipt-content"
      className={cn(
        "mx-auto w-full bg-white text-black",
        isThermal
          ? "p-4 font-mono text-[11px] leading-snug print:p-2"
          : "p-10 font-sans text-[13px] leading-normal print:p-8"
      )}
    >
      <div className="text-center">
        {data.tenant.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={data.tenant.logoUrl}
            alt=""
            className={cn("mx-auto mb-1 max-w-[60%] object-contain", isThermal ? "h-10" : "h-14")}
          />
        )}
        <div className={cn("font-bold", isThermal ? "text-sm" : "text-lg")}>{data.tenant.pharmacyName}</div>
        <div className="text-[10px]">{data.branch.name}</div>
        <div className="text-[10px]">{data.branch.licensedAddress}</div>
        {data.branch.gstin && <div className="text-[10px]">{t("gstin", { value: data.branch.gstin })}</div>}
        {data.branch.drugLicenseRetailNo && (
          <div className="text-[10px]">{t("dlRetail", { value: data.branch.drugLicenseRetailNo })}</div>
        )}
        {data.branch.drugLicenseWholesaleNo && (
          <div className="text-[10px]">{t("dlWholesale", { value: data.branch.drugLicenseWholesaleNo })}</div>
        )}
      </div>

      <Divider isThermal={isThermal} />

      {/* Printed too, not just shown on screen: a customer can be holding a
          receipt for a bill that was voided after it came off the printer, and
          a reprint that looks identical to a live one is worse than useless. */}
      {data.status === "cancelled" && (
        <div className="border border-current py-1 text-center font-bold tracking-widest uppercase">
          Cancelled
        </div>
      )}

      <div className="flex justify-between">
        <span>{t("invoiceLabel", { no: data.invoiceNo })}</span>
        <span>{format(new Date(data.invoiceDate), "dd/MM/yyyy HH:mm")}</span>
      </div>
      {data.customer && <div>{t("customer", { name: data.customer.name })}</div>}
      <div>{t("payment", { mode: paymentLabel })}</div>

      <Divider isThermal={isThermal} />

      <div className="space-y-1">
        <Row cols={[5, 1.5, 1.5, 2]}>
          <span>{t("item")}</span>
          <span className="text-right">{t("qty")}</span>
          <span className="text-right">{t("rate")}</span>
          <span className="text-right">{t("amt")}</span>
        </Row>
        {data.items.map((line) => (
          <div key={line.id}>
            <div className="truncate">
              {line.itemName}
              {line.manufacturer ? ` (${line.manufacturer})` : ""}
            </div>
            <div className={cn("flex justify-between text-neutral-600", isThermal ? "text-[10px]" : "text-[11px]")}>
              <span>
                {t("batch", { no: line.batchNo })}
                {line.hsnCode ? ` · ${t("hsn", { value: line.hsnCode })}` : ""}
              </span>
              {line.discountAmount > 0 && (
                <span>{t("disc", { amount: line.discountAmount.toFixed(2) })}</span>
              )}
              <span>{t("gst", { rate: line.taxRate })}</span>
            </div>
            {(line.cgstAmount > 0 || line.sgstAmount > 0) && (
              <div
                className={cn(
                  "flex justify-end gap-3 text-neutral-600",
                  isThermal ? "text-[10px]" : "text-[11px]"
                )}
              >
                <span>{t("cgstAmount", { amount: line.cgstAmount.toFixed(2) })}</span>
                <span>{t("sgstAmount", { amount: line.sgstAmount.toFixed(2) })}</span>
              </div>
            )}
            <Row cols={[5, 1.5, 1.5, 2]}>
              <span />
              <span className="text-right tabular-nums">{line.qty}</span>
              <span className="text-right tabular-nums">{line.rate.toFixed(2)}</span>
              <span className="text-right font-medium tabular-nums">
                {line.lineTotal.toFixed(2)}
              </span>
            </Row>
          </div>
        ))}
      </div>

      <Divider isThermal={isThermal} />

      <div className="space-y-0.5">
        <div className="flex justify-between">
          <span>{t("subtotal")}</span>
          <span className="tabular-nums">{formatCurrency(data.subtotal, locale)}</span>
        </div>
        <div className="flex justify-between">
          <span>{t("discount")}</span>
          <span className="tabular-nums">−{formatCurrency(data.discountAmount, locale)}</span>
        </div>
        <div className="flex justify-between">
          <span>{t("cgst")}</span>
          <span className="tabular-nums">{formatCurrency(data.taxAmount / 2, locale)}</span>
        </div>
        <div className="flex justify-between">
          <span>{t("sgst")}</span>
          <span className="tabular-nums">{formatCurrency(data.taxAmount - data.taxAmount / 2, locale)}</span>
        </div>
        <div
          className={cn(
            "flex justify-between font-bold",
            isThermal ? "text-sm" : "mt-1 border-t border-black/15 pt-1.5 text-base"
          )}
        >
          <span>{t("total")}</span>
          <span className="tabular-nums">{formatCurrency(data.total, locale)}</span>
        </div>
      </div>

      {(data.doctor || data.patientName) && (
        <>
          <Divider isThermal={isThermal} />
          <div className="text-[10px]">
            {data.doctor && (
              <div>
                {t("doctorPrefix", { name: data.doctor.name })}
                {data.doctor.registrationNo ? ` (${t("regNo", { no: data.doctor.registrationNo })})` : ""}
              </div>
            )}
            {data.patientName && (
              <div>
                {t("patient", { name: data.patientName })}
                {data.patientAge ? `, ${t("age", { value: data.patientAge })}` : ""}
              </div>
            )}
          </div>
        </>
      )}

      {data.branch.pharmacistName && (
        <div className="mt-2 text-[10px]">
          {data.branch.pharmacistName}
          {data.branch.pharmacistRegistrationNo
            ? ` (${t("regNo", { no: data.branch.pharmacistRegistrationNo })})`
            : ""}
          <br />
          {t("authorizedSignatory")}
        </div>
      )}

      {data.einvoiceIrn && (
        <>
          <Divider isThermal={isThermal} />
          <div className="text-center">
            {data.einvoiceQrImageDataUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={data.einvoiceQrImageDataUrl}
                alt="e-Invoice QR code"
                className="mx-auto h-24 w-24"
              />
            )}
            <div className="mt-1 text-[9px] break-all">{t("irn", { value: data.einvoiceIrn })}</div>
          </div>
        </>
      )}

      {data.ewayBillNo && (
        <div className="text-center text-[10px]">{t("ewayBill", { value: data.ewayBillNo })}</div>
      )}

      {data.tenant.invoiceFooterText && (
        <>
          <Divider isThermal={isThermal} />
          <div className="text-center text-[10px]">{data.tenant.invoiceFooterText}</div>
        </>
      )}

      {data.tenant.showPoweredBy && (
        <div className="mt-1 text-center text-[9px] text-neutral-500">{t("poweredBy")}</div>
      )}
    </div>
  );
}

function Divider({ isThermal }: { isThermal: boolean }) {
  return (
    <div
      className={cn(
        "my-1.5",
        isThermal ? "border-t border-dashed border-black/40" : "my-3 border-t border-black/15"
      )}
    />
  );
}

function Row({ children, cols }: { children: React.ReactNode; cols: number[] }) {
  return (
    <div
      className="grid gap-1"
      style={{ gridTemplateColumns: cols.map((c) => `${c}fr`).join(" ") }}
    >
      {children}
    </div>
  );
}
