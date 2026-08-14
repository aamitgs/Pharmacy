import { format } from "date-fns";
import type { ReceiptData } from "@/lib/actions/invoices";

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Cash",
  upi: "UPI",
  card: "Card",
  credit: "Credit",
};

export function ReceiptView({ data }: { data: ReceiptData }) {
  const isThermal = true;

  return (
    <div
      id="receipt-content"
      className="mx-auto w-full bg-white p-4 font-mono text-[11px] leading-snug text-black print:p-2"
    >
      <div className="text-center">
        <div className="text-sm font-bold">{data.tenant.pharmacyName}</div>
        <div className="text-[10px]">{data.branch.name}</div>
        <div className="text-[10px]">{data.branch.licensedAddress}</div>
        {data.branch.gstin && <div className="text-[10px]">GSTIN: {data.branch.gstin}</div>}
        {data.branch.drugLicenseRetailNo && (
          <div className="text-[10px]">DL (Retail): {data.branch.drugLicenseRetailNo}</div>
        )}
        {data.branch.drugLicenseWholesaleNo && (
          <div className="text-[10px]">DL (Wholesale): {data.branch.drugLicenseWholesaleNo}</div>
        )}
      </div>

      <Divider />

      <div className="flex justify-between">
        <span>Invoice: {data.invoiceNo}</span>
        <span>{format(new Date(data.invoiceDate), "dd/MM/yyyy HH:mm")}</span>
      </div>
      {data.customer && <div>Customer: {data.customer.name}</div>}
      <div>Payment: {PAYMENT_LABELS[data.paymentMode] ?? data.paymentMode}</div>

      <Divider />

      <div className="space-y-1">
        <Row cols={isThermal ? [5, 1.5, 1.5, 2] : [4, 1.5, 1.5, 1.5, 2]}>
          <span>Item</span>
          <span className="text-right">Qty</span>
          <span className="text-right">Rate</span>
          <span className="text-right">Amt</span>
        </Row>
        {data.items.map((line) => (
          <div key={line.id}>
            <div className="truncate">
              {line.itemName}
              {line.manufacturer ? ` (${line.manufacturer})` : ""}
            </div>
            <div className="flex justify-between text-[10px] text-neutral-600">
              <span>
                Batch {line.batchNo}
                {line.hsnCode ? ` · HSN ${line.hsnCode}` : ""}
              </span>
              {line.discountAmount > 0 && <span>Disc ₹{line.discountAmount.toFixed(2)}</span>}
              <span>GST {line.taxRate}%</span>
            </div>
            {(line.cgstAmount > 0 || line.sgstAmount > 0) && (
              <div className="flex justify-end gap-3 text-[10px] text-neutral-600">
                <span>CGST ₹{line.cgstAmount.toFixed(2)}</span>
                <span>SGST ₹{line.sgstAmount.toFixed(2)}</span>
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
          <span>Subtotal</span>
          <span className="tabular-nums">₹{data.subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>Discount</span>
          <span className="tabular-nums">−₹{data.discountAmount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>CGST</span>
          <span className="tabular-nums">₹{(data.taxAmount / 2).toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>SGST</span>
          <span className="tabular-nums">₹{(data.taxAmount - data.taxAmount / 2).toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm font-bold">
          <span>Total</span>
          <span className="tabular-nums">₹{data.total.toFixed(2)}</span>
        </div>
      </div>

      {(data.doctor || data.patientName) && (
        <>
          <Divider />
          <div className="text-[10px]">
            {data.doctor && (
              <div>
                Dr. {data.doctor.name}
                {data.doctor.registrationNo ? ` (Reg. ${data.doctor.registrationNo})` : ""}
              </div>
            )}
            {data.patientName && (
              <div>
                Patient: {data.patientName}
                {data.patientAge ? `, Age ${data.patientAge}` : ""}
              </div>
            )}
          </div>
        </>
      )}

      {data.branch.pharmacistName && (
        <div className="mt-2 text-[10px]">
          {data.branch.pharmacistName}
          {data.branch.pharmacistRegistrationNo
            ? ` (Reg. ${data.branch.pharmacistRegistrationNo})`
            : ""}
          <br />
          Authorized signatory
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
            <div className="mt-1 text-[9px] break-all">IRN: {data.einvoiceIrn}</div>
          </div>
        </>
      )}

      {data.ewayBillNo && (
        <div className="text-center text-[10px]">E-way bill: {data.ewayBillNo}</div>
      )}

      {data.tenant.invoiceFooterText && (
        <>
          <Divider />
          <div className="text-center text-[10px]">{data.tenant.invoiceFooterText}</div>
        </>
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
