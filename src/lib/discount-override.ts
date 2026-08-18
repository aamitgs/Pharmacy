/**
 * Rules for when a discount needs a manager's approval, and what a manager's
 * override PIN is allowed to be.
 *
 * Kept out of the server actions that use them so both can be unit-tested
 * directly: `"use server"` modules may only export async functions, and these
 * decisions are the part worth pinning down — they decide whether an approval
 * gets recorded against a real person or not at all.
 */

/**
 * Fixed length, not a range. The till's approval dialog auto-submits the
 * moment the field is full, which only works if every manager's PIN is the
 * same length — the counter has no idea who is about to approve. Six rather
 * than the four this replaced: still one keypad motion, but a hundred times
 * the guessing space for a credential typed in front of the person it gates.
 */
export const PIN_DIGITS = 6;

/**
 * Which parts of a sale exceed the staff discount cap, and therefore need a
 * manager's approval recorded against them.
 *
 * Deliberately reports *which* discounts, not just whether any did: an
 * approval smeared across every discount on the bill would credit the manager
 * with authorising the 2% on line 3 they were never asked about.
 */
export interface OverrideScope {
  /** Indices into the cart lines whose item discount exceeded the cap. */
  lineIndices: Set<number>;
  /** Whether the bill-level discount exceeded the cap. */
  bill: boolean;
}

export function discountsNeedingOverride(
  capPercent: number,
  role: string,
  linePercents: number[],
  billPercent: number
): OverrideScope {
  const scope: OverrideScope = { lineIndices: new Set(), bill: false };
  // Only counter staff are capped; an owner or pharmacist ringing up a sale
  // is already the authority the PIN would be asking for.
  if (role !== "counter_staff") return scope;
  linePercents.forEach((percent, i) => {
    if (percent > capPercent) scope.lineIndices.add(i);
  });
  if (billPercent > capPercent) scope.bill = true;
  return scope;
}

export function overrideRequired(scope: OverrideScope): boolean {
  return scope.lineIndices.size > 0 || scope.bill;
}

/**
 * Why a PIN is unacceptable, or null if it is fine.
 *
 * Stricter than a password rule would be, because this credential is typed on
 * a shared counter in front of the person it is meant to gate: the digits a
 * colleague would try first are exactly the ones worth refusing.
 */
export function pinRejectionReason(pin: string): string | null {
  if (!/^\d+$/.test(pin)) return "PIN must be digits only.";
  if (pin.length !== PIN_DIGITS) return `PIN must be exactly ${PIN_DIGITS} digits.`;
  if (/^(\d)\1*$/.test(pin)) return "PIN cannot be all the same digit.";
  const ascending = [...pin].every((d, i) => i === 0 || Number(d) === Number(pin[i - 1]) + 1);
  const descending = [...pin].every((d, i) => i === 0 || Number(d) === Number(pin[i - 1]) - 1);
  if (ascending || descending) return "PIN cannot be a run of consecutive digits.";
  return null;
}
