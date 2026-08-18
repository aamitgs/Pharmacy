/**
 * When a completed sale may be voided.
 *
 * Cancellation is for the mistake caught at the counter — wrong item, wrong
 * customer, card declined after the bill printed. It is not a returns
 * mechanism, and the rules here are what keep the two apart.
 *
 * Kept pure and separate from the server action so the boundaries can be
 * tested directly: these are the conditions under which stock moves and a tax
 * invoice stops counting, so getting one wrong is a GST problem, not a UI bug.
 */

export type CancellationBlockReason =
  | "already_cancelled"
  | "not_same_day"
  | "has_einvoice_irn";

export interface CancellationEligibility {
  allowed: boolean;
  reason?: CancellationBlockReason;
  /** Ready to show to the person who clicked Cancel. */
  message?: string;
}

export interface CancellationCandidate {
  status: string;
  invoiceDate: Date;
  einvoiceIrn: string | null;
}

/** Same calendar day in the server's local zone, which is the shop's day. */
export function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function canCancelInvoice(
  invoice: CancellationCandidate,
  now: Date
): CancellationEligibility {
  if (invoice.status === "cancelled") {
    return {
      allowed: false,
      reason: "already_cancelled",
      message: "This invoice has already been cancelled.",
    };
  }

  // An IRN means the invoice exists on the government e-invoice portal, and
  // this app has no API to cancel it there. Voiding only our copy would leave
  // a live IRN the IRP still counts — a mismatch that surfaces at filing time,
  // long after anyone remembers the sale.
  if (invoice.einvoiceIrn) {
    return {
      allowed: false,
      reason: "has_einvoice_irn",
      message:
        "This invoice has an e-invoice IRN and cannot be cancelled here — the IRN would stay live on the government portal. Raise a credit note instead.",
    };
  }

  // Same-day only. Past that, the invoice may already sit inside a filed
  // GSTR-1 period, and quietly removing it changes figures that were
  // submitted. The correct instrument then is a credit note, not a void.
  if (!isSameCalendarDay(invoice.invoiceDate, now)) {
    return {
      allowed: false,
      reason: "not_same_day",
      message:
        "Only today's invoices can be cancelled. For an earlier sale, raise a sales return or credit note so the GST records stay consistent.",
    };
  }

  return { allowed: true };
}

/**
 * Roles that may void a sale. A counter staffer who mis-rang a bill asks one
 * of these two — the same authority boundary as the discount cap.
 */
export const CANCEL_ROLES: readonly string[] = ["owner", "pharmacist"];

export interface CancellationViewState {
  /** Show the Cancel control. */
  allowed: boolean;
  /**
   * Why not, for a viewer who *could* cancel if the invoice were eligible.
   * Null for roles that never see the control at all — telling a counter
   * staffer an invoice is "too old to cancel" implies they could otherwise,
   * which is not true.
   */
  blockedMessage: string | null;
}

export function cancellationStateFor(
  invoice: CancellationCandidate,
  role: string,
  now: Date = new Date()
): CancellationViewState {
  if (!CANCEL_ROLES.includes(role)) return { allowed: false, blockedMessage: null };
  const eligibility = canCancelInvoice(invoice, now);
  return {
    allowed: eligibility.allowed,
    // An already-cancelled invoice needs no explanation — the receipt itself
    // is stamped cancelled, so repeating it under a missing button is noise.
    blockedMessage:
      eligibility.allowed || eligibility.reason === "already_cancelled"
        ? null
        : (eligibility.message ?? null),
  };
}
