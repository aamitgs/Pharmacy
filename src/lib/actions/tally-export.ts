"use server";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { getBranchFilter } from "@/lib/branch-scope";
import { buildTallyImportXml, type TallyVoucher } from "@/lib/tally/xml";

function dateWindow(from: string, to: string) {
  const fromDate = new Date(from);
  const toDate = new Date(to);
  toDate.setHours(23, 59, 59, 999);
  return { fromDate, toDate };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const CASH_LEDGER = "Cash";
const BANK_LEDGER = "Bank";
const SALES_LEDGER = "Sales Account";
const PURCHASE_LEDGER = "Purchase Account";
const OUTPUT_CGST_LEDGER = "Output CGST";
const OUTPUT_SGST_LEDGER = "Output SGST";
const INPUT_CGST_LEDGER = "Input CGST";
const INPUT_SGST_LEDGER = "Input SGST";
const ROUND_OFF_LEDGER = "Round Off";
const WALKIN_PARTY_LEDGER = "Cash Sales";

/** recordCustomerPayment always writes its note starting "Method: <value>" — see src/lib/actions/customers.ts. Fragile only in the sense that it's this app's own generated text, not user free text. */
function cashOrBankFromNote(note: string | null): string {
  const match = note?.match(/^Method: (\w+)/);
  return match?.[1] === "cash" ? CASH_LEDGER : BANK_LEDGER;
}

/**
 * Builds Tally-importable XML vouchers for every sale, purchase, customer
 * receipt, and supplier payment in the date range — a day-book sync, not a
 * full ledger-mapping system. Ledger names (Sales Account, Output CGST,
 * etc.) are the conventional defaults most Indian retail Tally setups
 * already use; Tally's own "Import Data" flow prompts to auto-create any
 * that don't exist yet, so a first import is expected to create masters
 * rather than silently fail.
 *
 * This app only tracks intra-state CGST+SGST (see gstr-export.ts's own
 * note on why — no interstate/B2B GSTIN capture), so every voucher splits
 * tax the same way GSTR export does: half CGST, half SGST, never IGST.
 * GRN lines have no separate purchase-side tax rate field, so Input
 * CGST/SGST reuses the item's current (sale-side) taxRate — a reasonable
 * assumption for a pharmacy buying and selling the same HSN-coded item,
 * not a guarantee if a tenant has since changed an item's tax rate.
 */
export interface TallyExportResult {
  xml: string;
  voucherCount: number;
  salesCount: number;
  purchaseCount: number;
  receiptCount: number;
  paymentCount: number;
}

export async function getTallyExportXml(from: string, to: string): Promise<TallyExportResult> {
  const session = await requireRole(["owner", "pharmacist"]);
  const tenantId = session.user.tenantId;
  const branchFilter = await getBranchFilter(tenantId, session.user.role);
  const { fromDate, toDate } = dateWindow(from, to);
  const dateFilter = { gte: fromDate, lte: toDate };

  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });

  const [invoices, grns, customerPayments, supplierPayments] = await Promise.all([
    prisma.salesInvoice.findMany({
      where: { tenantId, ...branchFilter, status: "completed", invoiceDate: dateFilter },
      include: { customer: { select: { name: true } } },
      orderBy: { invoiceDate: "asc" },
    }),
    prisma.grn.findMany({
      where: { tenantId, ...branchFilter, receivedAt: dateFilter },
      include: {
        supplier: { select: { name: true } },
        items: { include: { item: { select: { taxRate: true } } } },
      },
      orderBy: { receivedAt: "asc" },
    }),
    prisma.customerLedgerEntry.findMany({
      where: { tenantId, type: "payment", createdAt: dateFilter },
      include: { customer: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.supplierLedgerEntry.findMany({
      where: { tenantId, type: "payment", createdAt: dateFilter },
      include: { supplier: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const vouchers: TallyVoucher[] = [];

  for (const inv of invoices) {
    const taxable = round2(Number(inv.subtotal) - Number(inv.discountAmount));
    const cgst = round2(Number(inv.taxAmount) / 2);
    const sgst = round2(Number(inv.taxAmount) - cgst);
    const total = Number(inv.total);
    const roundOff = round2(total - (taxable + cgst + sgst));

    // Party = whichever ledger is actually debited: the customer for a
    // credit sale (real receivable), otherwise Cash — a cash/UPI/card sale
    // has no receivable, so naming the customer as party there would be
    // misleading even though this app happens to know who bought it.
    const partyLedgerName = inv.paymentMode === "credit" ? inv.customer?.name || WALKIN_PARTY_LEDGER : CASH_LEDGER;

    vouchers.push({
      vchType: "Sales",
      date: inv.invoiceDate,
      voucherNumber: inv.invoiceNo,
      partyLedgerName,
      narration: `POS sale ${inv.invoiceNo}`,
      entries: [
        { ledgerName: partyLedgerName, isDebit: true, amount: total },
        { ledgerName: SALES_LEDGER, isDebit: false, amount: taxable },
        ...(cgst > 0 ? [{ ledgerName: OUTPUT_CGST_LEDGER, isDebit: false, amount: cgst }] : []),
        ...(sgst > 0 ? [{ ledgerName: OUTPUT_SGST_LEDGER, isDebit: false, amount: sgst }] : []),
        ...(roundOff !== 0
          ? [{ ledgerName: ROUND_OFF_LEDGER, isDebit: roundOff < 0, amount: Math.abs(roundOff) }]
          : []),
      ],
    });
  }

  for (const g of grns) {
    let taxable = 0;
    let taxAmount = 0;
    for (const i of g.items) {
      const lineValue = i.qty * Number(i.rate);
      taxable += lineValue;
      taxAmount += (lineValue * Number(i.item.taxRate)) / 100;
    }
    taxable = round2(taxable);
    const cgst = round2(taxAmount / 2);
    const sgst = round2(taxAmount - cgst);
    const total = round2(taxable + cgst + sgst);

    vouchers.push({
      vchType: "Purchase",
      date: g.receivedAt,
      voucherNumber: g.supplierInvoiceNo,
      partyLedgerName: g.supplier.name,
      narration: `GRN from ${g.supplier.name}`,
      entries: [
        { ledgerName: PURCHASE_LEDGER, isDebit: true, amount: taxable },
        ...(cgst > 0 ? [{ ledgerName: INPUT_CGST_LEDGER, isDebit: true, amount: cgst }] : []),
        ...(sgst > 0 ? [{ ledgerName: INPUT_SGST_LEDGER, isDebit: true, amount: sgst }] : []),
        { ledgerName: g.supplier.name, isDebit: false, amount: total },
      ],
    });
  }

  for (const p of customerPayments) {
    const amount = Math.abs(Number(p.amount));
    const cashOrBank = cashOrBankFromNote(p.note);
    vouchers.push({
      vchType: "Receipt",
      date: p.createdAt,
      voucherNumber: p.id,
      partyLedgerName: p.customer.name,
      narration: p.note || undefined,
      entries: [
        { ledgerName: cashOrBank, isDebit: true, amount },
        { ledgerName: p.customer.name, isDebit: false, amount },
      ],
    });
  }

  for (const p of supplierPayments) {
    const amount = Math.abs(Number(p.amount));
    vouchers.push({
      vchType: "Payment",
      date: p.createdAt,
      voucherNumber: p.id,
      partyLedgerName: p.supplier.name,
      narration: p.note || undefined,
      entries: [
        { ledgerName: p.supplier.name, isDebit: true, amount },
        { ledgerName: BANK_LEDGER, isDebit: false, amount },
      ],
    });
  }

  return {
    xml: buildTallyImportXml(tenant.pharmacyName, vouchers),
    voucherCount: vouchers.length,
    salesCount: invoices.length,
    purchaseCount: grns.length,
    receiptCount: customerPayments.length,
    paymentCount: supplierPayments.length,
  };
}
