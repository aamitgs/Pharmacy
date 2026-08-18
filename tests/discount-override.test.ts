import { describe, it, expect } from "vitest";
import {
  discountsNeedingOverride,
  overrideRequired,
  pinRejectionReason,
  PIN_DIGITS,
} from "@/lib/discount-override";

/**
 * A discount above the staff cap is the one a counter staffer cannot give
 * alone, so it is the one an owner reviewing margin leakage most wants a name
 * against. These tests pin two things: that the right discounts are marked as
 * needing approval (too few and an override goes unrecorded, too many and a
 * manager is credited with approving discounts nobody asked them about), and
 * that a PIN is strong enough for the name to mean anything.
 */

const CAP = 10;

describe("which discounts need a manager's approval", () => {
  it("marks nothing when every discount is within the cap", () => {
    const scope = discountsNeedingOverride(CAP, "counter_staff", [5, 10, 0], 8);
    expect(scope.lineIndices.size).toBe(0);
    expect(scope.bill).toBe(false);
    expect(overrideRequired(scope)).toBe(false);
  });

  it("treats a discount exactly at the cap as allowed", () => {
    // The cap is what staff may give, not the first value they may not.
    const scope = discountsNeedingOverride(CAP, "counter_staff", [10], 10);
    expect(overrideRequired(scope)).toBe(false);
  });

  it("marks only the lines that breached the cap", () => {
    const scope = discountsNeedingOverride(CAP, "counter_staff", [5, 25, 8, 40], 0);
    expect([...scope.lineIndices].sort()).toEqual([1, 3]);
    expect(scope.bill).toBe(false);
  });

  it("marks the bill discount independently of the lines", () => {
    const scope = discountsNeedingOverride(CAP, "counter_staff", [2, 3], 30);
    expect(scope.lineIndices.size).toBe(0);
    expect(scope.bill).toBe(true);
    expect(overrideRequired(scope)).toBe(true);
  });

  it("marks both when both breach", () => {
    const scope = discountsNeedingOverride(CAP, "counter_staff", [50], 30);
    expect([...scope.lineIndices]).toEqual([0]);
    expect(scope.bill).toBe(true);
  });

  it("exempts roles that are already the approving authority", () => {
    // An owner or pharmacist ringing up the sale IS the authority the PIN
    // would ask for — prompting them for their own PIN would be theatre.
    for (const role of ["owner", "pharmacist", "ward_pharmacist"]) {
      const scope = discountsNeedingOverride(CAP, role, [90], 90);
      expect(overrideRequired(scope)).toBe(false);
    }
  });

  it("handles an empty cart", () => {
    expect(overrideRequired(discountsNeedingOverride(CAP, "counter_staff", [], 0))).toBe(false);
  });

  it("respects a tenant cap of zero", () => {
    // Cap 0 means staff may give no discount at all unaided — any discount
    // needs approval, but a zero discount is still not a discount.
    const scope = discountsNeedingOverride(0, "counter_staff", [0, 1], 0);
    expect([...scope.lineIndices]).toEqual([1]);
    expect(scope.bill).toBe(false);
  });

  it("respects a fractional cap", () => {
    const scope = discountsNeedingOverride(7.5, "counter_staff", [7.5, 7.51], 0);
    expect([...scope.lineIndices]).toEqual([1]);
  });
});

describe("override PIN rules", () => {
  it("accepts an ordinary PIN", () => {
    for (const pin of ["491703", "528361", "902148", "135702"]) {
      expect(pinRejectionReason(pin)).toBeNull();
    }
  });

  it("rejects anything that is not digits", () => {
    for (const pin of ["12a403", "12 340", "", "abcdef", "123456\n"]) {
      expect(pinRejectionReason(pin)).not.toBeNull();
    }
  });

  it("enforces one exact length", () => {
    // Fixed-length is load-bearing: the till dialog auto-submits when the
    // field fills, and it cannot know whose PIN is coming.
    expect(pinRejectionReason("49170")).toContain(`${PIN_DIGITS} digits`);
    expect(pinRejectionReason("4917035")).toContain(`${PIN_DIGITS} digits`);
    expect(pinRejectionReason("491703")).toBeNull();
    expect(PIN_DIGITS).toBe(6);
  });

  it("rejects the PINs a colleague would try first", () => {
    // This credential is typed on a shared counter in front of the person it
    // gates, so shoulder-surfable defaults are worth refusing outright.
    for (const pin of ["000000", "111111", "999999", "123456", "654321", "345678", "876543"]) {
      expect(pinRejectionReason(pin)).not.toBeNull();
    }
  });

  it("does not reject a PIN that merely contains a run", () => {
    // "cannot be a run" means the whole PIN, not any part of it — otherwise
    // the acceptable space gets small enough to be its own weakness.
    expect(pinRejectionReason("123457")).toBeNull();
    expect(pinRejectionReason("912345")).toBeNull();
  });
});
