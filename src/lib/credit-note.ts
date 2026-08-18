/**
 * Credit-note maths and eligibility.
 *
 * A credit note reduces an already-issued tax invoice, so the numbers here
 * land in GSTR-1 and GSTR-3B. The one thing worth being careful about is that
 * a partial return must credit back a *proportional* share of what the
 * customer actually paid for those units — not `rate x qty`. The invoice line
 * carried a share of any item and bill discount, and ignoring that refunds
 * more money and more tax than was ever collected.
 *
 * Pure and dependency-free so the arithmetic can be tested directly, in the
 * same spirit as src/lib/billing.ts.
 */

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface ReturnableLine {
  invoiceItemId: string;
  itemId: string;
  batchId: string;
  /** Units on the original invoice line. */
  soldQty: number;
  /** Units already credited by earlier credit notes against this line. */
  returnedQty: number;
  rate: number;
  taxRate: number;
  /** The whole line's discount on the original invoice. */
  discountAmount: number;
}

export interface CreditNoteLineResult {
  invoiceItemId: string;
  itemId: string;
  batchId: string;
  qty: number;
  rate: number;
  taxRate: number;
  /** Share of the original line discount being credited back. */
  discountAmount: number;
  taxableValue: number;
  taxAmount: number;
  cgst: number;
  sgst: number;
  lineTotal: number;
}

export interface CreditNoteTotals {
  lines: CreditNoteLineResult[];
  subtotal: number;
  taxAmount: number;
  cgst: number;
  sgst: number;
  total: number;
}

/** How many units of a line are still returnable. */
export function remainingQty(line: ReturnableLine): number {
  return Math.max(0, line.soldQty - line.returnedQty);
}

/**
 * Values one returned line.
 *
 * The discount share is pro-rated by quantity and rounded once, then the
 * taxable value is derived from it — rather than rounding the taxable value
 * and the discount independently, which lets them disagree by a paisa and
 * makes the credit note fail to reconcile against the invoice it credits.
 */
export function computeCreditNoteLine(
  line: ReturnableLine,
  returnQty: number
): CreditNoteLineResult {
  const discountShare =
    line.soldQty > 0 ? round2((line.discountAmount * returnQty) / line.soldQty) : 0;
  const taxableValue = round2(line.rate * returnQty - discountShare);
  const taxAmount = round2((taxableValue * line.taxRate) / 100);
  // Split the way the invoice does: CGST takes the floor half, SGST the
  // remainder, so an odd paisa never goes missing between the two.
  const cgst = round2(taxAmount / 2);
  const sgst = round2(taxAmount - cgst);

  return {
    invoiceItemId: line.invoiceItemId,
    itemId: line.itemId,
    batchId: line.batchId,
    qty: returnQty,
    rate: line.rate,
    taxRate: line.taxRate,
    discountAmount: discountShare,
    taxableValue,
    taxAmount,
    cgst,
    sgst,
    lineTotal: round2(taxableValue + taxAmount),
  };
}

/**
 * Values a whole credit note. Lines with a zero return quantity are dropped —
 * a credit note listing items that were not returned is confusing on paper
 * and pointless in the GST return.
 */
export function computeCreditNote(
  lines: ReturnableLine[],
  returnQtyByInvoiceItemId: Record<string, number>
): CreditNoteTotals {
  const results: CreditNoteLineResult[] = [];
  for (const line of lines) {
    const qty = returnQtyByInvoiceItemId[line.invoiceItemId] ?? 0;
    if (qty <= 0) continue;
    results.push(computeCreditNoteLine(line, qty));
  }

  const subtotal = round2(results.reduce((sum, l) => sum + l.taxableValue, 0));
  const taxAmount = round2(results.reduce((sum, l) => sum + l.taxAmount, 0));
  const cgst = round2(results.reduce((sum, l) => sum + l.cgst, 0));
  const sgst = round2(results.reduce((sum, l) => sum + l.sgst, 0));

  return {
    lines: results,
    subtotal,
    taxAmount,
    cgst,
    sgst,
    total: round2(subtotal + taxAmount),
  };
}

/**
 * The last date a credit note may be issued against an invoice.
 *
 * Section 34(2) of the CGST Act: no later than 30 November following the end
 * of the financial year the supply was made in (or the date the annual return
 * is filed, whichever is earlier — the 30 Nov date is the practical bound).
 * India's financial year runs April to March, so an invoice dated 5 Jan 2026
 * belongs to FY 2025-26 and can be credited until 30 Nov 2026.
 */
export function creditNoteDeadline(invoiceDate: Date): Date {
  const month = invoiceDate.getMonth(); // 0 = January
  const year = invoiceDate.getFullYear();
  // Jan-Mar belong to the financial year that started the previous April.
  const financialYearStart = month >= 3 ? year : year - 1;
  return new Date(financialYearStart + 1, 10, 30, 23, 59, 59, 999); // 30 Nov
}

export type CreditNoteBlockReason =
  | "invoice_cancelled"
  | "past_gst_deadline"
  | "fully_returned";

export interface CreditNoteEligibility {
  allowed: boolean;
  reason?: CreditNoteBlockReason;
  message?: string;
}

export function canRaiseCreditNote(
  invoice: { status: string; invoiceDate: Date },
  lines: ReturnableLine[],
  now: Date
): CreditNoteEligibility {
  if (invoice.status === "cancelled") {
    return {
      allowed: false,
      reason: "invoice_cancelled",
      message: "This invoice was cancelled — there is nothing left to credit.",
    };
  }

  if (now > creditNoteDeadline(invoice.invoiceDate)) {
    const deadline = creditNoteDeadline(invoice.invoiceDate);
    return {
      allowed: false,
      reason: "past_gst_deadline",
      message: `A credit note against this invoice had to be issued by ${deadline.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} under section 34 of the CGST Act. Handle this outside the GST return.`,
    };
  }

  if (lines.every((l) => remainingQty(l) === 0)) {
    return {
      allowed: false,
      reason: "fully_returned",
      message: "Every item on this invoice has already been returned.",
    };
  }

  return { allowed: true };
}

/** Roles that may raise a credit note — same authority as voiding a bill. */
export const CREDIT_NOTE_ROLES = ["owner", "pharmacist"] as const;
