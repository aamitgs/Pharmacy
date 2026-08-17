import * as Sentry from "@sentry/nextjs";

/**
 * Phase 11.1: explicit error reporting for the fire-and-forget paths that
 * deliberately swallow their own errors by design (e-invoice/e-way bill
 * generation, WhatsApp sends, scheduled backup/refill-reminder cron runs —
 * see runEinvoiceAttempt and friends: "never blocks checkout, failures are
 * swallowed"). Those never reach an uncaught exception, so Next's
 * `onRequestError` hook (wired in src/instrumentation.ts, which catches
 * everything else) never sees them either. Call this at the point they're
 * already being swallowed, instead of adding a new try/catch.
 *
 * `context` values become Sentry tags — pass IDs only (tenantId,
 * invoiceId, customerId), never a raw invoice/customer/patient record.
 * The shared `beforeSend` scrub (src/lib/observability/scrub.ts) is a
 * safety net, not a substitute for keeping call sites disciplined here.
 */
export function reportError(error: unknown, context: { tenantId?: string; action: string; [key: string]: string | undefined }) {
  Sentry.captureException(error, (scope) => {
    scope.setTag("action", context.action);
    for (const [key, value] of Object.entries(context)) {
      if (key !== "action" && value !== undefined) scope.setTag(key, value);
    }
    return scope;
  });
}
