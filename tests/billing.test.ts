import { describe, it, expect } from "vitest";
import {
  computeBilling,
  effectiveDiscountPercent,
  type BillingLineInput,
  type StackedDiscountInput,
} from "@/lib/billing";

/**
 * Unit tests for the GST/discount math.
 *
 * This is the most legally-sensitive logic in the app — it decides what tax
 * is charged and what appears on a statutory GST invoice — and it is a pure
 * function, so it is cheap to pin down precisely. Until this file existed it
 * had no automated coverage at all.
 *
 * The rule that matters most, from the Phase 1 spec: a discount must reduce
 * the *taxable value*, so tax is charged on the discounted amount, never on
 * the pre-discount amount with the discount taken off afterwards.
 */

const line = (over: Partial<BillingLineInput> = {}): BillingLineInput => ({
  lineId: "l1",
  qty: 1,
  rate: 100,
  taxRate: 12,
  discountPercent: 0,
  ...over,
});

const billDiscount = (value: number, isPercent = false): StackedDiscountInput => ({
  type: "bill",
  isPercent,
  value,
});

describe("GST is charged on the discounted taxable value, not the gross", () => {
  it("applies tax after an item discount, not before", () => {
    // 100 gross, 10% item discount -> taxable 90, 12% GST on 90 = 10.80.
    // Taxing first (12 tax) then discounting would give a different total.
    const r = computeBilling([line({ discountPercent: 10 })], []);
    expect(r.subtotal).toBe(100);
    expect(r.itemDiscountTotal).toBe(10);
    expect(r.taxableTotal).toBe(90);
    expect(r.taxAmount).toBe(10.8);
    expect(r.total).toBe(100.8);
  });

  it("applies tax after a bill-level discount too", () => {
    const r = computeBilling([line()], [billDiscount(20)]);
    expect(r.taxableTotal).toBe(80);
    expect(r.taxAmount).toBe(9.6);
    expect(r.total).toBe(89.6);
  });

  it("charges nothing on a fully discounted line", () => {
    const r = computeBilling([line({ discountPercent: 100 })], []);
    expect(r.taxableTotal).toBe(0);
    expect(r.taxAmount).toBe(0);
    expect(r.total).toBe(0);
  });

  it("charges no tax on an exempt (0%) item", () => {
    const r = computeBilling([line({ taxRate: 0 })], []);
    expect(r.taxableTotal).toBe(100);
    expect(r.taxAmount).toBe(0);
    expect(r.total).toBe(100);
  });

  it("keeps per-line tax rates independent under a shared bill discount", () => {
    // 5% and 12% goods on one bill: each line must be taxed at its own rate
    // on its own share of the discounted base, not at a blended rate.
    const r = computeBilling(
      [line({ lineId: "a", rate: 100, taxRate: 5 }), line({ lineId: "b", rate: 100, taxRate: 12 })],
      [billDiscount(20)]
    );
    const [a, b] = r.lines;
    expect(a.taxableValue).toBe(90);
    expect(b.taxableValue).toBe(90);
    expect(a.taxAmount).toBe(4.5); // 5% of 90
    expect(b.taxAmount).toBe(10.8); // 12% of 90
    expect(r.taxAmount).toBe(15.3);
  });
});

describe("CGST/SGST split", () => {
  it("splits tax into two equal halves", () => {
    const r = computeBilling([line()], []);
    expect(r.lines[0].cgst).toBe(6);
    expect(r.lines[0].sgst).toBe(6);
    expect(r.lines[0].taxAmount).toBe(12);
  });

  it("never loses a paisa when the tax is an odd number of paise", () => {
    // taxable 83.50 @ 12% = 10.02 -> 5.01 / 5.01. Pick a case where naive
    // double-rounding of each half could drift from the total.
    const r = computeBilling([line({ rate: 83.5 })], []);
    const l = r.lines[0];
    expect(l.cgst + l.sgst).toBeCloseTo(l.taxAmount, 10);
    expect(l.taxableValue + l.cgst + l.sgst).toBeCloseTo(l.lineTotal, 10);
  });

  it("assigns any odd paisa to SGST so the halves still sum to the tax", () => {
    // 100.10 @ 5% = 5.005 -> rounds to 5.01; halves are 2.51 (round) and
    // 2.50 (remainder), summing back to exactly 5.01.
    const r = computeBilling([line({ rate: 100.1, taxRate: 5 })], []);
    const l = r.lines[0];
    expect(l.cgst + l.sgst).toBe(l.taxAmount);
    expect(l.taxAmount).toBeCloseTo(5.01, 2);
  });
});

describe("item and scheme discounts", () => {
  it("computes the item discount as a percentage of qty * rate", () => {
    const r = computeBilling([line({ qty: 3, rate: 50, discountPercent: 10 })], []);
    expect(r.subtotal).toBe(150);
    expect(r.itemDiscountTotal).toBe(15);
    expect(r.taxableTotal).toBe(135);
  });

  it("subtracts a flat scheme discount on top of the item discount", () => {
    const r = computeBilling([line({ discountPercent: 10, schemeDiscountAmount: 20 })], []);
    expect(r.itemDiscountTotal).toBe(10);
    expect(r.schemeDiscountTotal).toBe(20);
    expect(r.taxableTotal).toBe(70);
    expect(r.discountAmount).toBe(30);
  });

  it("clamps a scheme discount to what is left after the item discount", () => {
    // A buy-x-get-y scheme must never drive a line negative.
    const r = computeBilling([line({ discountPercent: 50, schemeDiscountAmount: 999 })], []);
    expect(r.schemeDiscountTotal).toBe(50);
    expect(r.taxableTotal).toBe(0);
    expect(r.total).toBe(0);
  });

  it("ignores a negative scheme discount rather than inflating the bill", () => {
    const r = computeBilling([line({ schemeDiscountAmount: -50 })], []);
    expect(r.schemeDiscountTotal).toBe(0);
    expect(r.taxableTotal).toBe(100);
  });
});

describe("bill-level discount apportionment", () => {
  it("splits a flat bill discount across lines in proportion to taxable value", () => {
    // 100 and 300 -> 25% / 75% of a 40 discount = 10 / 30.
    const r = computeBilling(
      [line({ lineId: "a", rate: 100 }), line({ lineId: "b", rate: 300 })],
      [billDiscount(40)]
    );
    expect(r.lines[0].billDiscountShare).toBe(10);
    expect(r.lines[1].billDiscountShare).toBe(30);
    expect(r.taxableTotal).toBe(360);
  });

  it("treats a percentage bill discount as a percentage of the post-item base", () => {
    // Item discount first (100 -> 90), then 10% of 90 = 9, not 10% of 100.
    const r = computeBilling([line({ discountPercent: 10 })], [billDiscount(10, true)]);
    expect(r.billDiscountAmount).toBe(9);
    expect(r.taxableTotal).toBe(81);
  });

  it("caps a flat bill discount at the taxable base so the bill cannot go negative", () => {
    const r = computeBilling([line()], [billDiscount(500)]);
    expect(r.billDiscountAmount).toBe(100);
    expect(r.taxableTotal).toBe(0);
    expect(r.total).toBe(0);
  });
});

describe("stacked bill discounts (manual + loyalty + coupon)", () => {
  const stack: StackedDiscountInput[] = [
    { type: "bill", isPercent: false, value: 10 },
    { type: "loyalty", isPercent: true, value: 5 },
    { type: "coupon", isPercent: false, value: 20 },
  ];

  it("keeps each discount as its own line and computes each off the same base", () => {
    // Base 200: manual 10, loyalty 5% of 200 = 10, coupon 20. Loyalty is 5%
    // of the original base, NOT of the base already reduced by the manual
    // discount — they stack side by side rather than compounding.
    const r = computeBilling([line({ rate: 200 })], stack);
    expect(r.billDiscounts).toEqual([
      { type: "bill", amount: 10 },
      { type: "loyalty", amount: 10 },
      { type: "coupon", amount: 20 },
    ]);
    expect(r.billDiscountAmount).toBe(40);
    expect(r.taxableTotal).toBe(160);
  });

  it("scales every discount down proportionally when together they exceed the base", () => {
    // Base 30, raw discounts 10 + 1.5 + 20 = 31.5 -> scaled by 30/31.5.
    const r = computeBilling([line({ rate: 30 })], stack);
    expect(r.billDiscountAmount).toBeCloseTo(30, 2);
    expect(r.taxableTotal).toBe(0);
    expect(r.total).toBe(0);
    for (const d of r.billDiscounts) expect(d.amount).toBeGreaterThan(0);
  });

  it("preserves the relative size of each discount when scaling", () => {
    const r = computeBilling(
      [line({ rate: 30 })],
      [
        { type: "bill", isPercent: false, value: 30 },
        { type: "coupon", isPercent: false, value: 30 },
      ]
    );
    // Two equal discounts overshooting 2x -> each scaled to half the base.
    expect(r.billDiscounts[0].amount).toBe(15);
    expect(r.billDiscounts[1].amount).toBe(15);
  });
});

describe("reported totals are internally consistent", () => {
  const scenarios: [string, BillingLineInput[], StackedDiscountInput[]][] = [
    ["single plain line", [line()], []],
    ["item discount only", [line({ discountPercent: 15 })], []],
    ["two lines, mixed tax rates", [line({ lineId: "a", taxRate: 5 }), line({ lineId: "b", taxRate: 18 })], []],
    ["scheme + item discount", [line({ discountPercent: 10, schemeDiscountAmount: 5 })], []],
    [
      "two lines with a proportional bill discount",
      [line({ lineId: "a", rate: 100 }), line({ lineId: "b", rate: 300 })],
      [billDiscount(40)],
    ],
  ];

  it.each(scenarios)("%s: taxable + tax === total", (_name, lines, discounts) => {
    const r = computeBilling(lines, discounts);
    expect(r.taxableTotal + r.taxAmount).toBeCloseTo(r.total, 2);
  });

  it.each(scenarios)("%s: line totals sum to the bill total", (_name, lines, discounts) => {
    const r = computeBilling(lines, discounts);
    const sum = r.lines.reduce((s, l) => s + l.lineTotal, 0);
    expect(sum).toBeCloseTo(r.total, 2);
  });

  it.each(scenarios)("%s: discountAmount is the sum of its parts", (_name, lines, discounts) => {
    const r = computeBilling(lines, discounts);
    expect(r.discountAmount).toBeCloseTo(
      r.itemDiscountTotal + r.schemeDiscountTotal + r.billDiscountAmount,
      2
    );
  });

  it.each(scenarios)("%s: no negative money anywhere", (_name, lines, discounts) => {
    const r = computeBilling(lines, discounts);
    expect(r.total).toBeGreaterThanOrEqual(0);
    expect(r.taxableTotal).toBeGreaterThanOrEqual(0);
    expect(r.taxAmount).toBeGreaterThanOrEqual(0);
    for (const l of r.lines) expect(l.taxableValue).toBeGreaterThanOrEqual(0);
  });
});

describe("degenerate and boundary inputs", () => {
  it("returns all zeros for an empty cart", () => {
    const r = computeBilling([], []);
    expect(r).toMatchObject({ subtotal: 0, taxableTotal: 0, taxAmount: 0, total: 0, discountAmount: 0 });
    expect(r.lines).toEqual([]);
  });

  it("does not apply a coupon to an empty cart", () => {
    // Guards against a coupon on an empty cart producing a negative bill.
    const r = computeBilling([], [{ type: "coupon", isPercent: false, value: 50 }]);
    expect(r.billDiscountAmount).toBe(0);
    expect(r.total).toBe(0);
  });

  it("handles a zero-quantity line without dividing by zero", () => {
    const r = computeBilling([line({ qty: 0 })], [billDiscount(10)]);
    expect(r.subtotal).toBe(0);
    expect(r.total).toBe(0);
    expect(Number.isNaN(r.billDiscountAmount)).toBe(false);
  });

  it("handles a zero-rate (free) line", () => {
    const r = computeBilling([line({ rate: 0 })], []);
    expect(r.total).toBe(0);
  });

  it("rounds money to two decimals rather than carrying float noise", () => {
    // 0.1 + 0.2 territory — the result must be clean rupees and paise.
    const r = computeBilling([line({ qty: 3, rate: 0.1, taxRate: 18 })], []);
    for (const value of [r.subtotal, r.taxableTotal, r.taxAmount, r.total]) {
      expect(Number.isInteger(Math.round(value * 100))).toBe(true);
      expect(value).toBe(Math.round(value * 100) / 100);
    }
  });
});

describe("computeBilling input contract (callers clamp, this does not)", () => {
  // These document the boundary rather than endorsing it. completeSale's zod
  // schema already enforces qty as a positive int and discountPercent within
  // 0-100 (src/lib/actions/pos.ts), and the POS inputs clamp too, so these
  // values cannot reach here through the real sale path. Pinned so that if
  // a future caller skips validation, the consequence is visible here.
  it("does not clamp an out-of-range item discount (>100% goes negative)", () => {
    const r = computeBilling([line({ discountPercent: 150 })], []);
    expect(r.taxableTotal).toBeLessThan(0);
  });

  it("does not clamp a negative quantity", () => {
    const r = computeBilling([line({ qty: -1 })], []);
    expect(r.subtotal).toBeLessThan(0);
  });
});

describe("effectiveDiscountPercent (drives the manager-PIN cap check)", () => {
  it("passes a percentage discount straight through", () => {
    expect(effectiveDiscountPercent({ isPercent: true, value: 15 }, 1000)).toBe(15);
  });

  it("converts a flat discount into a percentage of the base", () => {
    expect(effectiveDiscountPercent({ isPercent: false, value: 150 }, 1000)).toBe(15);
  });

  it("returns 0 for a flat discount on a zero base instead of dividing by zero", () => {
    expect(effectiveDiscountPercent({ isPercent: false, value: 150 }, 0)).toBe(0);
    expect(Number.isFinite(effectiveDiscountPercent({ isPercent: false, value: 150 }, 0))).toBe(true);
  });

  it("reports a flat discount larger than the base as over 100%", () => {
    // Must exceed any sane staff cap so it still triggers manager approval.
    expect(effectiveDiscountPercent({ isPercent: false, value: 200 }, 100)).toBe(200);
  });
});

describe("regression: a real sale that was verified end to end", () => {
  it("reproduces the printed receipt exactly", () => {
    // Paracetamol 500mg x2 @ 28.00 with a 5% line discount, plus Corex
    // Cough Syrup x1 @ 90.00, both 12% GST. These are the figures on the
    // receipt produced by an actual keyboard-only sale during verification.
    const r = computeBilling(
      [
        { lineId: "para", qty: 2, rate: 28, taxRate: 12, discountPercent: 5 },
        { lineId: "corex", qty: 1, rate: 90, taxRate: 12, discountPercent: 0 },
      ],
      []
    );
    expect(r.subtotal).toBe(146);
    expect(r.discountAmount).toBe(2.8);
    expect(r.taxableTotal).toBe(143.2);
    expect(r.taxAmount).toBe(17.18);
    expect(r.total).toBe(160.38);

    const [para, corex] = r.lines;
    expect(para).toMatchObject({ taxableValue: 53.2, cgst: 3.19, sgst: 3.19, lineTotal: 59.58 });
    expect(corex).toMatchObject({ taxableValue: 90, cgst: 5.4, sgst: 5.4, lineTotal: 100.8 });
  });
});

describe("regression: bill-discount apportionment must not lose paise", () => {
  /**
   * Each line's share used to be rounded independently, so the shares did
   * not sum back to the discount printed on the invoice: three 100.00 lines
   * sharing a flat 10.00 discount produced 3.33 x3 = 9.99 against a printed
   * 10.00, leaving taxable at 290.01 where 300.00 - 10.00 = 290.00, with GST
   * then charged on the drifted value. The gap grew with line count (~0.11
   * across 23 lines). Fixed with largest-remainder allocation in
   * `apportion()`.
   */
  const threeEqualLines = [1, 2, 3].map((i) => line({ lineId: `l${i}`, rate: 100 }));

  it("subtotal - discountAmount equals taxableTotal", () => {
    const r = computeBilling(threeEqualLines, [billDiscount(10)]);
    expect(r.subtotal - r.discountAmount).toBeCloseTo(r.taxableTotal, 2);
    expect(r.taxableTotal).toBe(290);
  });

  it("apportioned shares sum to the discount actually charged", () => {
    const r = computeBilling(threeEqualLines, [billDiscount(10)]);
    const apportioned = r.lines.reduce((s, l) => s + l.billDiscountShare, 0);
    expect(apportioned).toBeCloseTo(r.billDiscountAmount, 2);
  });

  it("gives the leftover paisa to a line rather than dropping it", () => {
    const r = computeBilling(threeEqualLines, [billDiscount(10)]);
    // 1000 paise over 3 equal lines: 334 + 333 + 333. The odd paisa lands on
    // the first line by the index tie-break, and the total is exact.
    expect(r.lines.map((l) => l.billDiscountShare)).toEqual([3.34, 3.33, 3.33]);
    expect(r.billDiscountAmount).toBe(10);
  });

  it("stays exact as the line count grows", () => {
    for (const n of [2, 3, 6, 7, 9, 11, 17, 23, 50]) {
      const lines = Array.from({ length: n }, (_, i) => line({ lineId: `l${i}`, rate: 100 }));
      const r = computeBilling(lines, [billDiscount(10)]);
      const apportioned = r.lines.reduce((s, l) => s + l.billDiscountShare, 0);
      expect(apportioned, `${n} lines: shares must sum to the discount`).toBeCloseTo(10, 2);
      expect(r.subtotal - r.discountAmount, `${n} lines: bill must reconcile`).toBeCloseTo(
        r.taxableTotal,
        2
      );
    }
  });

  it("still apportions proportionally, not equally", () => {
    // The fix must not flatten the split: a 300 line takes three times the
    // share of a 100 line.
    const r = computeBilling(
      [line({ lineId: "a", rate: 100 }), line({ lineId: "b", rate: 300 })],
      [billDiscount(10)]
    );
    expect(r.lines[0].billDiscountShare).toBe(2.5);
    expect(r.lines[1].billDiscountShare).toBe(7.5);
  });

  it("assigns the whole discount to a single-line bill", () => {
    const r = computeBilling([line({ rate: 100 })], [billDiscount(3.33)]);
    expect(r.lines[0].billDiscountShare).toBe(3.33);
    expect(r.taxableTotal).toBe(96.67);
  });

  it("apportions a percentage discount exactly too", () => {
    // 7% of 300 = 21.00 across three equal lines -> 7.00 each.
    const r = computeBilling(threeEqualLines, [billDiscount(7, true)]);
    const apportioned = r.lines.reduce((s, l) => s + l.billDiscountShare, 0);
    expect(apportioned).toBeCloseTo(r.billDiscountAmount, 2);
    expect(r.taxableTotal).toBe(279);
  });

  it("apportions a stacked discount set exactly", () => {
    const r = computeBilling(threeEqualLines, [
      { type: "bill", isPercent: false, value: 10 },
      { type: "loyalty", isPercent: true, value: 5 },
      { type: "coupon", isPercent: false, value: 1 },
    ]);
    const apportioned = r.lines.reduce((s, l) => s + l.billDiscountShare, 0);
    expect(apportioned).toBeCloseTo(r.billDiscountAmount, 2);
    expect(r.subtotal - r.discountAmount).toBeCloseTo(r.taxableTotal, 2);
  });
});
