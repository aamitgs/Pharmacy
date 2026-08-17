"use client";

import { format } from "date-fns";
import { useLocale, useTranslations } from "next-intl";
import { formatCurrency } from "@/lib/format";
import type { AppLocale } from "@/i18n/locales";
import type { ReceiptData } from "@/lib/actions/invoices";

const PAYMENT_LABEL_KEYS: Record<string, string> = {
  cash: "paymentCash",
  upi: "paymentUpi",
  card: "paymentCard",
  credit: "paymentCredit",
  insurance: "paymentInsurance",
};

export function ReceiptView({ data }: { data: ReceiptData }) {
  const isThermal = true;
  const t = useTranslations("receipt");
  const locale = useLocale() as AppLocale;
  const paymentLabel = PAYMENT_LABEL_KEYS[data.paymentMode] ? t(PAYMENT_LABEL_KEYS[data.paymentMode]) : data.paymentMode;

  return (
    <div
      id="receipt-content"
      className="mx-auto w-full bg-white p-4 font-mono text-[11px] leading-snug text-black print:p-2"
    >
      <div className="text-center">
        {data.tenant.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={data.tenant.logoUrl} alt="" className="mx-auto mb-1 h-10 max-w-[60%] object-contain" />
        )}
        <div className="text-sm font-bold">{data.tenant.pharmacyName}</div>
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

      <Divider />

      <div className="flex justify-between">
        <span>{t("invoiceLabel", { no: data.invoiceNo })}</span>
        <span>{format(new Date(data.invoiceDate), "dd/MM/yyyy HH:mm")}</span>
      </div>
      {data.customer && <div>{t("customer", { name: data.customer.name })}</div>}
      <div>{t("payment", { mode: paymentLabel })}</div>

      <Divider />

      <div className="space-y-1">
        <Row cols={isThermal ? [5, 1.5, 1.5, 2] : [4, 1.5, 1.5, 1.5, 2]}>
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
            <div className="flex justify-between text-[10px] text-neutral-600">
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
              <div className="flex justify-end gap-3 text-[10px] text-neutral-600">
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

      <Divider />

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
        <div className="flex justify-between text-sm font-bold">
          <span>{t("total")}</span>
          <span className="tabular-nums">{formatCurrency(data.total, locale)}</span>
        </div>
      </div>

      {(data.doctor || data.patientName) && (
        <>
          <Divider />
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
          <Divider />
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
          <Divider />
          <div className="text-center text-[10px]">{data.tenant.invoiceFooterText}</div>
        </>
      )}

      {data.tenant.showPoweredBy && (
        <div className="mt-1 text-center text-[9px] text-neutral-500">{t("poweredBy")}</div>
      )}
    </div>
  );
}

function Divider() {
  return <div className="my-1.5 border-t border-dashed border-black/40" />;
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
