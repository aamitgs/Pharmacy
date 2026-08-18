"use server";

import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/rbac";
import { getBranchFilter } from "@/lib/branch-scope";
import { shouldShowPoweredBy } from "@/lib/branding";
import { cancellationStateFor } from "@/lib/invoice-cancellation-rules";
import { canRaiseCreditNote, CREDIT_NOTE_ROLES } from "@/lib/credit-note";

export async function getInvoiceForReceipt(id: string) {
  const session = await requireSession();
  const invoice = await prisma.salesInvoice.findFirst({
    where: { id, tenantId: session.user.tenantId },
    include: {
      branch: true,
      customer: true,
      doctor: true,
      pharmacistSignoff: { select: { name: true } },
      items: {
        include: { item: true, batch: true, creditNoteItems: { select: { qty: true } } },
      },
      creditNotes: {
        select: { id: true, creditNoteNo: true, creditNoteDate: true, total: true },
        orderBy: { creditNoteDate: "desc" },
      },
    },
  });
  if (!invoice) return null;

  const [tenant, showPoweredBy] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({ where: { id: session.user.tenantId } }),
    shouldShowPoweredBy(session.user.tenantId),
  ]);

  return {
    id: invoice.id,
    invoiceNo: invoice.invoiceNo,
    invoiceDate: invoice.invoiceDate,
    paymentMode: invoice.paymentMode,
    status: invoice.status,
    cancelledAt: invoice.cancelledAt,
    cancellationReason: invoice.cancellationReason,
    // Whether this specific viewer may void it — role and the same-day/IRN
    // rules resolved server-side so the button is simply absent rather than
    // present-and-failing.
    cancellation: cancellationStateFor(invoice, session.user.role),
    // Whether this viewer can start a customer return. Kept distinct from
    // cancellation: a bill from last week cannot be voided but can still be
    // credited, and that is exactly when the receipt needs to say so.
    canRaiseCreditNote:
      (CREDIT_NOTE_ROLES as readonly string[]).includes(session.user.role) &&
      canRaiseCreditNote(
        invoice,
        invoice.items.map((i) => ({
          invoiceItemId: i.id,
          itemId: i.itemId,
          batchId: i.batchId,
          soldQty: i.qty,
          returnedQty: i.creditNoteItems.reduce((sum, c) => sum + c.qty, 0),
          rate: Number(i.rate),
          taxRate: Number(i.taxRate),
          discountAmount: Number(i.discountAmount),
        })),
        new Date()
      ).allowed,
    creditNotes: invoice.creditNotes.map((c) => ({
      id: c.id,
      creditNoteNo: c.creditNoteNo,
      creditNoteDate: c.creditNoteDate,
      total: Number(c.total),
    })),
    subtotal: Number(invoice.subtotal),
    taxAmount: Number(invoice.taxAmount),
    discountAmount: Number(invoice.discountAmount),
    total: Number(invoice.total),
    patientName: invoice.patientName,
    patientAge: invoice.patientAge,
    customer: invoice.customer
      ? { id: invoice.customer.id, name: invoice.customer.name, phone: invoice.customer.phone }
      : null,
    einvoiceIrn: invoice.einvoiceIrn,
    einvoiceAckNo: invoice.einvoiceAckNo,
    einvoiceQrImageDataUrl: invoice.einvoiceQrData
      ? await QRCode.toDataURL(invoice.einvoiceQrData).catch(() => null)
      : null,
    ewayBillNo: invoice.ewayBillNo,
    einvoiceEnabled: invoice.branch.einvoiceEnabled,
    ewayBillThreshold: Number(invoice.branch.ewayBillThreshold),
    doctor: invoice.doctor
      ? { name: invoice.doctor.name, registrationNo: invoice.doctor.registrationNo }
      : null,
    branch: {
      name: invoice.branch.name,
      licensedAddress: invoice.branch.licensedAddress,
      gstin: invoice.branch.gstin,
      drugLicenseRetailNo: invoice.branch.drugLicenseRetailNo,
      drugLicenseWholesaleNo: invoice.branch.drugLicenseWholesaleNo,
      pharmacistName: invoice.branch.pharmacistName,
      pharmacistRegistrationNo: invoice.branch.pharmacistRegistrationNo,
    },
    tenant: {
      pharmacyName: tenant.pharmacyName,
      invoiceFooterText: tenant.invoiceFooterText,
      logoUrl: tenant.logoUrl,
      showPoweredBy,
    },
    prescriptionImageUrl: invoice.prescriptionImageUrl,
    pharmacistSignoff: invoice.pharmacistSignoff
      ? { name: invoice.pharmacistSignoff.name, at: invoice.pharmacistSignoffAt }
      : null,
    // Intra-state assumption (CGST = SGST = half the line's tax) matches the
    // convention already established in src/lib/billing.ts's computeBilling
    // — same split, just re-derived here for display since SalesInvoiceItem
    // only stores the combined taxRate, not separate cgst/sgst columns.
    items: invoice.items.map((line) => {
      const qty = line.qty;
      const rate = Number(line.rate);
      const discountAmount = Number(line.discountAmount);
      const taxRate = Number(line.taxRate);
      const taxableValue = qty * rate - discountAmount;
      const taxAmount = (taxableValue * taxRate) / 100;
      const cgstAmount = taxAmount / 2;
      const sgstAmount = taxAmount - cgstAmount;
      return {
        id: line.id,
        itemName: line.item.name,
        manufacturer: line.item.manufacturer,
        hsnCode: line.item.hsnCode,
        batchNo: line.batch.batchNo,
        qty,
        rate,
        taxRate,
        discountAmount,
        cgstAmount,
        sgstAmount,
        lineTotal: taxableValue + taxAmount,
      };
    }),
  };
}

export type ReceiptData = NonNullable<Awaited<ReturnType<typeof getInvoiceForReceipt>>>;

export async function listInvoices() {
  const session = await requireSession();
  const branchFilter = await getBranchFilter(session.user.tenantId, session.user.role);
  const invoices = await prisma.salesInvoice.findMany({
    where: { tenantId: session.user.tenantId, ...branchFilter },
    include: { customer: true },
    orderBy: { invoiceDate: "desc" },
    take: 200,
  });

  return invoices.map((inv) => ({
    id: inv.id,
    invoiceNo: inv.invoiceNo,
    invoiceDate: inv.invoiceDate,
    customerName: inv.customer?.name ?? "Walk-in",
    paymentMode: inv.paymentMode,
    status: inv.status,
    total: Number(inv.total),
  }));
}
