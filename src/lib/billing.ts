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
  /** Flat rupee discount from an auto-applied Scheme (e.g. free units under buy_x_get_y). */
  schemeDiscountAmount?: number;
}

export interface BillDiscountInput {
  isPercent: boolean;
  value: number;
}

/**
 * Bill-level discounts stack: the staff-entered manual discount, an
 * auto-applied loyalty-tier discount, and a validated coupon can all be
 * present on the same sale, each shown as its own line per spec ("shown as
 * a distinct line from manual discounts"). Each is computed off the same
 * post-item/scheme taxable base (not compounded on top of each other) and,
 * in the rare case their sum would exceed that base, scaled down
 * proportionally so the bill never goes negative.
 */
export interface StackedDiscountInput extends BillDiscountInput {
  type: "bill" | "loyalty" | "coupon";
}

export interface BillingLineResult {
  lineId: string;
  grossAmount: number;
  itemDiscountAmount: number;
  schemeDiscountAmount: number;
  billDiscountShare: number;
  taxableValue: number;
  cgst: number;
  sgst: number;
  taxAmount: number;
  lineTotal: number;
}

export interface BillDiscountBreakdown {
  type: "bill" | "loyalty" | "coupon";
  amount: number;
}

export interface BillingResult {
  lines: BillingLineResult[];
  subtotal: number;
  itemDiscountTotal: number;
  schemeDiscountTotal: number;
  billDiscounts: BillDiscountBreakdown[];
  billDiscountAmount: number;
  discountAmount: number;
  taxableTotal: number;
  taxAmount: number;
  total: number;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Splits `total` rupees across `weights` so that the parts sum back to
 * `total` exactly, to the paisa.
 *
 * Rounding each line's share independently does not do this: three 100.00
 * lines sharing a flat 10.00 discount each round to 3.33, summing to 9.99
 * while the invoice prints 10.00. The bill then fails to reconcile
 * (subtotal - discount !== taxable) and GST is charged on the drifted
 * taxable value. The gap grows with line count.
 *
 * Largest-remainder allocation instead: work in whole paise, give every line
 * its floor, then hand the leftover paise one at a time to the lines with
 * the largest truncated fraction. Ties break on index so the result is
 * deterministic — the client preview and the server's authoritative recompute
 * must agree exactly.
 */
function apportion(total: number, weights: number[], weightTotal: number): number[] {
  if (weights.length === 0) return [];

  const totalPaise = Math.round(total * 100);
  if (totalPaise === 0 || weightTotal <= 0) return weights.map(() => 0);

  const exact = weights.map((w) => (totalPaise * w) / weightTotal);
  const floors = exact.map((p) => Math.floor(p));
  let leftover = totalPaise - floors.reduce((sum, p) => sum + p, 0);

  // Descending by fractional part; index as a stable tie-break.
  const order = exact
    .map((p, i) => ({ i, frac: p - Math.floor(p) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);

  const paise = [...floors];
  for (let k = 0; k < order.length && leftover > 0; k++, leftover--) {
    paise[order[k].i] += 1;
  }

  return paise.map((p) => p / 100);
}

export function computeBilling(
  lineInputs: BillingLineInput[],
  billDiscounts: StackedDiscountInput[]
): BillingResult {
  const preBillDiscount = lineInputs.map((line) => {
    const grossAmount = line.qty * line.rate;
    const itemDiscountAmount = round2((grossAmount * line.discountPercent) / 100);
    const schemeDiscountAmount = round2(
      Math.max(0, Math.min(line.schemeDiscountAmount ?? 0, grossAmount - itemDiscountAmount))
    );
    const taxableBeforeBillDiscount = grossAmount - itemDiscountAmount - schemeDiscountAmount;
    return { line, grossAmount, itemDiscountAmount, schemeDiscountAmount, taxableBeforeBillDiscount };
  });

  const totalTaxableBeforeBillDiscount = preBillDiscount.reduce(
    (sum, l) => sum + l.taxableBeforeBillDiscount,
    0
  );

  const rawAmounts = billDiscounts.map((d) =>
    Math.max(0, d.isPercent ? (totalTaxableBeforeBillDiscount * d.value) / 100 : d.value)
  );
  const rawTotal = rawAmounts.reduce((sum, a) => sum + a, 0);
  const scale =
    rawTotal > totalTaxableBeforeBillDiscount && rawTotal > 0
      ? totalTaxableBeforeBillDiscount / rawTotal
      : 1;
  const billDiscountBreakdown: BillDiscountBreakdown[] = billDiscounts.map((d, i) => ({
    type: d.type,
    amount: round2(rawAmounts[i] * scale),
  }));
  const billDiscountAmount = round2(billDiscountBreakdown.reduce((sum, d) => sum + d.amount, 0));

  const billDiscountShares = apportion(
    billDiscountAmount,
    preBillDiscount.map((l) => l.taxableBeforeBillDiscount),
    totalTaxableBeforeBillDiscount
  );

  const lines: BillingLineResult[] = preBillDiscount.map((l, i) => {
    const billDiscountShare = billDiscountShares[i];
    const taxableValue = round2(l.taxableBeforeBillDiscount - billDiscountShare);
    const taxAmount = round2((taxableValue * l.line.taxRate) / 100);
    const cgst = round2(taxAmount / 2);
    const sgst = round2(taxAmount - cgst);
    const lineTotal = round2(taxableValue + cgst + sgst);
    return {
      lineId: l.line.lineId,
      grossAmount: round2(l.grossAmount),
      itemDiscountAmount: l.itemDiscountAmount,
      schemeDiscountAmount: l.schemeDiscountAmount,
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
  const schemeDiscountTotal = round2(lines.reduce((s, l) => s + l.schemeDiscountAmount, 0));
  const taxableTotal = round2(lines.reduce((s, l) => s + l.taxableValue, 0));
  const taxAmount = round2(lines.reduce((s, l) => s + l.taxAmount, 0));
  const total = round2(lines.reduce((s, l) => s + l.lineTotal, 0));

  return {
    lines,
    subtotal,
    itemDiscountTotal,
    schemeDiscountTotal,
    billDiscounts: billDiscountBreakdown,
    billDiscountAmount,
    discountAmount: round2(itemDiscountTotal + schemeDiscountTotal + billDiscountAmount),
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
