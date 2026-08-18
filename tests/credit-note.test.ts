import { describe, it, expect } from "vitest";
import {
  computeCreditNote,
  computeCreditNoteLine,
  canRaiseCreditNote,
  creditNoteDeadline,
  remainingQty,
  CREDIT_NOTE_ROLES,
  type ReturnableLine,
} from "@/lib/credit-note";
import { computeBilling } from "@/lib/billing";

/**
 * A credit note reduces an already-issued tax invoice, so these numbers land
 * in GSTR-1 and GSTR-3B. The failure that matters most is refunding more than
 * was collected: the invoice line carried a share of the item and bill
 * discounts, and crediting `rate x qty` would hand back money and output tax
 * the shop never took.
 */

const line = (overrides: Partial<ReturnableLine> = {}): ReturnableLine => ({
  invoiceItemId: "line-1",
  itemId: "item-1",
  batchId: "batch-1",
  soldQty: 5,
  returnedQty: 0,
  rate: 100,
  taxRate: 12,
  discountAmount: 0,
  ...overrides,
});

describe("valuing one returned line", () => {
  it("credits a full return of an undiscounted line", () => {
    const result = computeCreditNoteLine(line(), 5);
    expect(result.taxableValue).toBe(500);
    expect(result.taxAmount).toBe(60);
    expect(result.cgst).toBe(30);
    expect(result.sgst).toBe(30);
    expect(result.lineTotal).toBe(560);
  });

  it("credits a partial return proportionally", () => {
    const result = computeCreditNoteLine(line(), 2);
    expect(result.taxableValue).toBe(200);
    expect(result.taxAmount).toBe(24);
    expect(result.lineTotal).toBe(224);
  });

  it("credits back only the discount share for the units returned", () => {
    // 5 units at 100 with 50 off the line: the customer paid 450 for five, so
    // two units are worth 180 — not 200.
    const result = computeCreditNoteLine(line({ discountAmount: 50 }), 2);
    expect(result.discountAmount).toBe(20);
    expect(result.taxableValue).toBe(180);
    expect(result.taxAmount).toBe(21.6);
  });

  it("never credits more tax than the line collected", () => {
    // The whole point: sum the parts of a fully-returned line and you must
    // land back on what the invoice charged, not above it.
    const l = line({ soldQty: 3, rate: 33.33, discountAmount: 7.77 });
    const whole = computeCreditNoteLine(l, 3);
    const invoiceTaxable = 33.33 * 3 - 7.77;
    expect(whole.taxableValue).toBeCloseTo(invoiceTaxable, 2);
  });

  it("splits an odd paisa of tax without losing it", () => {
    const result = computeCreditNoteLine(line({ rate: 8.45, soldQty: 1, taxRate: 5 }), 1);
    expect(result.cgst + result.sgst).toBeCloseTo(result.taxAmount, 10);
  });

  it("handles a zero-rated line", () => {
    const result = computeCreditNoteLine(line({ taxRate: 0 }), 2);
    expect(result.taxAmount).toBe(0);
    expect(result.lineTotal).toBe(200);
  });
});

describe("valuing a whole credit note", () => {
  const lines = [
    line({ invoiceItemId: "a", rate: 100, soldQty: 5, discountAmount: 50 }),
    line({ invoiceItemId: "b", rate: 40, soldQty: 2, taxRate: 5 }),
  ];

  it("sums only the lines actually returned", () => {
    const result = computeCreditNote(lines, { a: 2 });
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].invoiceItemId).toBe("a");
    expect(result.subtotal).toBe(180);
    expect(result.total).toBe(201.6);
  });

  it("drops lines with a zero return quantity", () => {
    const result = computeCreditNote(lines, { a: 0, b: 0 });
    expect(result.lines).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it("adds up across mixed tax rates", () => {
    const result = computeCreditNote(lines, { a: 5, b: 2 });
    // a: 500 - 50 = 450 taxable, 54 tax. b: 80 taxable, 4 tax.
    expect(result.subtotal).toBe(530);
    expect(result.taxAmount).toBe(58);
    expect(result.total).toBe(588);
    expect(result.cgst + result.sgst).toBeCloseTo(result.taxAmount, 10);
  });

  it("returns exactly what the sale charged when everything comes back", () => {
    // Cross-checked against the billing engine rather than a hand-computed
    // number: a full return of every line must undo the invoice completely,
    // and this is the assertion that catches the two drifting apart.
    const inputs = [
      { lineId: "l0", qty: 3, rate: 49.5, taxRate: 12, discountPercent: 10 },
      { lineId: "l1", qty: 1, rate: 120, taxRate: 5, discountPercent: 0 },
    ];
    const billing = computeBilling(inputs, [{ type: "bill", isPercent: true, value: 5 }]);

    // What the invoice actually stores per line: the units, the rate, and
    // every rupee of discount that line absorbed (item + scheme + its share
    // of the bill discount).
    const returnable: ReturnableLine[] = inputs.map((input, i) => ({
      invoiceItemId: input.lineId,
      itemId: `i${i}`,
      batchId: `b${i}`,
      soldQty: input.qty,
      returnedQty: 0,
      rate: input.rate,
      taxRate: input.taxRate,
      discountAmount: round2(input.qty * input.rate - billing.lines[i].taxableValue),
    }));

    const credit = computeCreditNote(returnable, { l0: 3, l1: 1 });
    expect(credit.subtotal).toBeCloseTo(billing.taxableTotal, 2);
    expect(credit.taxAmount).toBeCloseTo(billing.taxAmount, 2);
    expect(credit.total).toBeCloseTo(billing.total, 2);
  });
});

describe("how much is still returnable", () => {
  it("subtracts what earlier credit notes already took", () => {
    expect(remainingQty(line({ soldQty: 5, returnedQty: 2 }))).toBe(3);
    expect(remainingQty(line({ soldQty: 5, returnedQty: 5 }))).toBe(0);
  });

  it("never goes negative on inconsistent data", () => {
    expect(remainingQty(line({ soldQty: 2, returnedQty: 5 }))).toBe(0);
  });
});

describe("the GST deadline for issuing a credit note", () => {
  it("uses 30 November after the invoice's financial year", () => {
    // FY 2026-27 runs Apr 2026 - Mar 2027, so its deadline is 30 Nov 2027.
    expect(creditNoteDeadline(new Date("2026-08-18")).toISOString().slice(0, 10)).toBe("2027-11-30");
    expect(creditNoteDeadline(new Date("2026-04-01")).toISOString().slice(0, 10)).toBe("2027-11-30");
  });

  it("puts January to March in the financial year that began the previous April", () => {
    // 5 Jan 2026 is in FY 2025-26, whose deadline is 30 Nov 2026 — a year
    // earlier than a naive calendar-year reading would give.
    expect(creditNoteDeadline(new Date("2026-01-05")).toISOString().slice(0, 10)).toBe("2026-11-30");
    expect(creditNoteDeadline(new Date("2026-03-31")).toISOString().slice(0, 10)).toBe("2026-11-30");
  });
});

describe("when a credit note may be raised", () => {
  const invoice = { status: "completed", invoiceDate: new Date("2026-08-18T10:00:00") };
  const now = new Date("2026-08-20T10:00:00");

  it("allows one against a completed invoice with stock still out", () => {
    expect(canRaiseCreditNote(invoice, [line()], now).allowed).toBe(true);
  });

  it("allows one long after the sale, unlike cancellation", () => {
    // This is the whole reason it exists: cancellation is same-day, a credit
    // note is the instrument for everything after that.
    expect(canRaiseCreditNote(invoice, [line()], new Date("2027-06-01")).allowed).toBe(true);
  });

  it("refuses one against a cancelled invoice", () => {
    const result = canRaiseCreditNote({ ...invoice, status: "cancelled" }, [line()], now);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("invoice_cancelled");
  });

  it("refuses one past the section 34 deadline", () => {
    const result = canRaiseCreditNote(invoice, [line()], new Date("2027-12-01"));
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("past_gst_deadline");
    expect(result.message).toMatch(/30 Nov 2027/);
  });

  it("refuses one when everything has already come back", () => {
    const result = canRaiseCreditNote(invoice, [line({ soldQty: 5, returnedQty: 5 })], now);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("fully_returned");
  });

  it("still allows one when only some units remain", () => {
    expect(canRaiseCreditNote(invoice, [line({ soldQty: 5, returnedQty: 4 })], now).allowed).toBe(
      true
    );
  });

  it("keeps counter staff out", () => {
    expect(CREDIT_NOTE_ROLES).not.toContain("counter_staff");
    expect(CREDIT_NOTE_ROLES).toContain("owner");
    expect(CREDIT_NOTE_ROLES).toContain("pharmacist");
  });
});

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
