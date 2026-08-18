import type { CartLine } from "@/store/cart-store";
import type { PosItem, PosCustomer, PosDoctor } from "@/components/pos/types";
import type { BillingResult } from "@/lib/billing";
import type { PaymentMode } from "@/generated/prisma/client";
import type { ReceiptHeader } from "./db";

/**
 * Builds a ReceiptData-shaped object entirely from data already in the
 * browser (cart, catalog, the already-computed client-side billing, and
 * the cached branch/tenant header) — no server round-trip. This is what
 * lets printing work for a sale that's still sitting in the offline queue.
 */
export function buildOfflineReceiptData(params: {
  localId: string;
  invoiceNo: string;
  lines: CartLine[];
  catalogByItemId: Map<string, PosItem>;
  billing: BillingResult;
  paymentMode: PaymentMode;
  customer: PosCustomer | null;
  doctor: PosDoctor | null;
  patientName: string;
  patientAge: string;
  header: ReceiptHeader;
}) {
  const { lines, catalogByItemId, billing, header } = params;

  return {
    id: params.localId,
    invoiceNo: params.invoiceNo,
    invoiceDate: new Date(),
    paymentMode: params.paymentMode,
    status: "completed" as const,
    // An offline sale has no server invoice yet, so there is nothing to
    // cancel — it is still sitting in the local queue, and clearing it is the
    // queue's own concern, not a void of a tax invoice that does not exist.
    cancelledAt: null,
    cancellationReason: null,
    cancellation: { allowed: false, blockedMessage: null },
    subtotal: billing.subtotal,
    taxAmount: billing.taxAmount,
    discountAmount: billing.discountAmount,
    total: billing.total,
    patientName: params.patientName || null,
    patientAge: params.patientAge ? Number(params.patientAge) : null,
    customer: params.customer ? { id: params.customer.id, name: params.customer.name, phone: params.customer.phone } : null,
    einvoiceIrn: null,
    einvoiceAckNo: null,
    einvoiceQrImageDataUrl: null,
    ewayBillNo: null,
    einvoiceEnabled: false,
    ewayBillThreshold: Infinity,
    doctor: params.doctor ? { name: params.doctor.name, registrationNo: params.doctor.registrationNo } : null,
    branch: header.branch ?? {
      name: "—",
      licensedAddress: "",
      gstin: null,
      drugLicenseRetailNo: null,
      drugLicenseWholesaleNo: null,
      pharmacistName: null,
      pharmacistRegistrationNo: null,
    },
    tenant: header.tenant,
    prescriptionImageUrl: null,
    pharmacistSignoff: null,
    items: lines.map((line, i) => {
      const catalogItem = catalogByItemId.get(line.itemId);
      const lineBilling = billing.lines[i];
      return {
        id: line.lineId,
        itemName: line.itemName,
        manufacturer: line.manufacturer,
        hsnCode: catalogItem?.hsnCode ?? null,
        batchNo: line.batchNo,
        qty: line.qty,
        rate: line.rate,
        taxRate: line.taxRate,
        discountAmount: lineBilling.itemDiscountAmount + lineBilling.schemeDiscountAmount + lineBilling.billDiscountShare,
        cgstAmount: lineBilling.cgst,
        sgstAmount: lineBilling.sgst,
        lineTotal: lineBilling.lineTotal,
      };
    }),
  };
}
