// Shared billing math — imported by both the POS client (live cart totals)
// and the completeSale server action (authoritative recompute from raw
// inputs, never trusting client-submitted totals). Pure functions only.

export interface BillingLineInput {
  lineId: string;
  qty: number;
  rate: number;
  taxRate: number;
  /** Item-level discount, percent of (qty * rate). 0-100. */
  discountPercent: number;
}

export interface BillDiscountInput {
  isPercent: boolean;
  value: number;
}

export interface BillingLineResult {
  lineId: string;
  grossAmount: number;
  itemDiscountAmount: number;
  billDiscountShare: number;
  taxableValue: number;
  cgst: number;
  sgst: number;
  taxAmount: number;
  lineTotal: number;
}

export interface BillingResult {
  lines: BillingLineResult[];
  subtotal: number;
  itemDiscountTotal: number;
  billDiscountAmount: number;
  discountAmount: number;
  taxableTotal: number;
  taxAmount: number;
  total: number;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function computeBilling(
  lineInputs: BillingLineInput[],
  billDiscount: BillDiscountInput
): BillingResult {
  const preBillDiscount = lineInputs.map((line) => {
    const grossAmount = line.qty * line.rate;
    const itemDiscountAmount = round2((grossAmount * line.discountPercent) / 100);
    const taxableBeforeBillDiscount = grossAmount - itemDiscountAmount;
    return { line, grossAmount, itemDiscountAmount, taxableBeforeBillDiscount };
  });

  const totalTaxableBeforeBillDiscount = preBillDiscount.reduce(
    (sum, l) => sum + l.taxableBeforeBillDiscount,
    0
  );

  const billDiscountAmount = round2(
    Math.max(
      0,
      Math.min(
        billDiscount.isPercent
          ? (totalTaxableBeforeBillDiscount * billDiscount.value) / 100
          : billDiscount.value,
        totalTaxableBeforeBillDiscount
      )
    )
  );

  const lines: BillingLineResult[] = preBillDiscount.map((l) => {
    const share =
      totalTaxableBeforeBillDiscount > 0
        ? l.taxableBeforeBillDiscount / totalTaxableBeforeBillDiscount
        : 0;
    const billDiscountShare = round2(billDiscountAmount * share);
    const taxableValue = round2(l.taxableBeforeBillDiscount - billDiscountShare);
    const taxAmount = round2((taxableValue * l.line.taxRate) / 100);
    const cgst = round2(taxAmount / 2);
    const sgst = round2(taxAmount - cgst);
    const lineTotal = round2(taxableValue + cgst + sgst);
    return {
      lineId: l.line.lineId,
      grossAmount: round2(l.grossAmount),
      itemDiscountAmount: l.itemDiscountAmount,
      billDiscountShare,
      taxableValue,
      cgst,
      sgst,
      taxAmount: round2(cgst + sgst),
      lineTotal,
    };
  });

  const subtotal = round2(lines.reduce((s, l) => s + l.grossAmount, 0));
  const itemDiscountTotal = round2(lines.reduce((s, l) => s + l.itemDiscountAmount, 0));
  const taxableTotal = round2(lines.reduce((s, l) => s + l.taxableValue, 0));
  const taxAmount = round2(lines.reduce((s, l) => s + l.taxAmount, 0));
  const total = round2(lines.reduce((s, l) => s + l.lineTotal, 0));

  return {
    lines,
    subtotal,
    itemDiscountTotal,
    billDiscountAmount,
    discountAmount: round2(itemDiscountTotal + billDiscountAmount),
    taxableTotal,
    taxAmount,
    total,
  };
}

/** Effective discount % for manager-PIN-cap comparisons (amount discounts are converted). */
export function effectiveDiscountPercent(
  discount: BillDiscountInput,
  baseAmount: number
): number {
  if (discount.isPercent) return discount.value;
  if (baseAmount <= 0) return 0;
  return (discount.value / baseAmount) * 100;
}
