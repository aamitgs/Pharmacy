"use server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/rbac";

export async function getInvoiceForReceipt(id: string) {
  const session = await requireSession();
  const invoice = await prisma.salesInvoice.findFirst({
    where: { id, tenantId: session.user.tenantId },
    include: {
      branch: true,
      customer: true,
      doctor: true,
      items: {
        include: { item: true, batch: true },
      },
    },
  });
  if (!invoice) return null;

  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: session.user.tenantId } });

  return {
    id: invoice.id,
    invoiceNo: invoice.invoiceNo,
    invoiceDate: invoice.invoiceDate,
    paymentMode: invoice.paymentMode,
    status: invoice.status,
    subtotal: Number(invoice.subtotal),
    taxAmount: Number(invoice.taxAmount),
    discountAmount: Number(invoice.discountAmount),
    total: Number(invoice.total),
    patientName: invoice.patientName,
    patientAge: invoice.patientAge,
    customer: invoice.customer
      ? { name: invoice.customer.name, phone: invoice.customer.phone }
      : null,
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
    },
    items: invoice.items.map((line) => {
      const qty = line.qty;
      const rate = Number(line.rate);
      const discountAmount = Number(line.discountAmount);
      const taxRate = Number(line.taxRate);
      const taxableValue = qty * rate - discountAmount;
      const taxAmount = (taxableValue * taxRate) / 100;
      return {
        id: line.id,
        itemName: line.item.name,
        manufacturer: line.item.manufacturer,
        batchNo: line.batch.batchNo,
        qty,
        rate,
        taxRate,
        discountAmount,
        lineTotal: taxableValue + taxAmount,
      };
    }),
  };
}

export type ReceiptData = NonNullable<Awaited<ReturnType<typeof getInvoiceForReceipt>>>;
