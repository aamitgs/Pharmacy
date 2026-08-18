import { describe, it, expect } from "vitest";
import {
  canCancelInvoice,
  cancellationStateFor,
  isSameCalendarDay,
  CANCEL_ROLES,
} from "@/lib/invoice-cancellation-rules";

/**
 * Cancelling a sale puts stock back on the shelf and stops a tax invoice
 * counting. The boundaries below are what keep that a counter-level fix for a
 * mis-rung bill rather than a way to quietly edit a filed GST return, so each
 * one is worth pinning:
 *
 *  - same day only, because an older invoice may already sit inside a filed
 *    GSTR-1 period;
 *  - never once an IRN exists, because the invoice is then also on the
 *    government portal and this app cannot cancel it there;
 *  - never twice, because a second pass would restock the same units again.
 */

const TODAY = new Date("2026-08-18T14:30:00");

const completed = (overrides: Partial<Parameters<typeof canCancelInvoice>[0]> = {}) => ({
  status: "completed",
  invoiceDate: new Date("2026-08-18T09:15:00"),
  einvoiceIrn: null,
  ...overrides,
});

describe("when a sale may be voided", () => {
  it("allows a completed same-day invoice with no IRN", () => {
    expect(canCancelInvoice(completed(), TODAY).allowed).toBe(true);
  });

  it("refuses one that is already cancelled", () => {
    // A second pass would increment the same batches again, handing the shop
    // stock it never had.
    const result = canCancelInvoice(completed({ status: "cancelled" }), TODAY);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("already_cancelled");
  });

  it("refuses one from a previous day", () => {
    const result = canCancelInvoice(
      completed({ invoiceDate: new Date("2026-08-17T23:59:00") }),
      TODAY
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("not_same_day");
    expect(result.message).toMatch(/credit note/i);
  });

  it("refuses one dated tomorrow", () => {
    // Clock skew or a bad import, but either way not today's business.
    const result = canCancelInvoice(
      completed({ invoiceDate: new Date("2026-08-19T00:01:00") }),
      TODAY
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("not_same_day");
  });

  it("allows one from earlier the same day, right up to midnight boundaries", () => {
    expect(
      canCancelInvoice(completed({ invoiceDate: new Date("2026-08-18T00:00:00") }), TODAY).allowed
    ).toBe(true);
    expect(
      canCancelInvoice(
        completed({ invoiceDate: new Date("2026-08-18T23:59:59") }),
        new Date("2026-08-18T23:59:59")
      ).allowed
    ).toBe(true);
  });

  it("refuses one carrying an e-invoice IRN", () => {
    // The IRN would stay live on the IRP; only our copy would disappear.
    const result = canCancelInvoice(completed({ einvoiceIrn: "IRN123456789" }), TODAY);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("has_einvoice_irn");
  });

  it("reports already-cancelled before the other reasons", () => {
    // Whichever else is true, "you already did this" is the useful answer.
    const result = canCancelInvoice(
      completed({
        status: "cancelled",
        invoiceDate: new Date("2020-01-01T00:00:00"),
        einvoiceIrn: "IRN1",
      }),
      TODAY
    );
    expect(result.reason).toBe("already_cancelled");
  });
});

describe("same-day comparison", () => {
  it("compares calendar days, not elapsed hours", () => {
    // 23:50 and 00:10 are 20 minutes apart but different business days.
    expect(
      isSameCalendarDay(new Date("2026-08-17T23:50:00"), new Date("2026-08-18T00:10:00"))
    ).toBe(false);
    // 00:05 and 23:55 are nearly 24 hours apart but the same day.
    expect(
      isSameCalendarDay(new Date("2026-08-18T00:05:00"), new Date("2026-08-18T23:55:00"))
    ).toBe(true);
  });

  it("distinguishes the same day-of-month in different months and years", () => {
    expect(
      isSameCalendarDay(new Date("2026-07-18T10:00:00"), new Date("2026-08-18T10:00:00"))
    ).toBe(false);
    expect(
      isSameCalendarDay(new Date("2025-08-18T10:00:00"), new Date("2026-08-18T10:00:00"))
    ).toBe(false);
  });
});

describe("what the receipt screen shows", () => {
  it("offers the control to the roles that may cancel", () => {
    for (const role of CANCEL_ROLES) {
      expect(cancellationStateFor(completed(), role, TODAY).allowed).toBe(true);
    }
  });

  it("hides it entirely from roles that may not", () => {
    for (const role of ["counter_staff", "ward_nurse", "ward_pharmacist"]) {
      const state = cancellationStateFor(completed(), role, TODAY);
      expect(state.allowed).toBe(false);
      // No explanation either: telling a counter staffer *why* they can't
      // implies they otherwise could.
      expect(state.blockedMessage).toBeNull();
    }
  });

  it("explains the block to someone who could otherwise cancel", () => {
    const state = cancellationStateFor(
      completed({ invoiceDate: new Date("2026-08-01T10:00:00") }),
      "owner",
      TODAY
    );
    expect(state.allowed).toBe(false);
    expect(state.blockedMessage).toMatch(/only today/i);
  });

  it("stays quiet about an invoice that is already cancelled", () => {
    // The receipt is stamped CANCELLED; repeating it under a missing button
    // is noise.
    const state = cancellationStateFor(completed({ status: "cancelled" }), "owner", TODAY);
    expect(state.allowed).toBe(false);
    expect(state.blockedMessage).toBeNull();
  });

  it("excludes counter staff from the cancel roles", () => {
    expect(CANCEL_ROLES).not.toContain("counter_staff");
  });
});
