import type { ErrorEvent, EventHint } from "@sentry/core";

// Phase 11.1: shared `beforeSend` for both the server and client Sentry
// clients. This app's error messages sometimes interpolate real values
// (a phone number in a validation error, a patient/customer name in a
// thrown Error) — redacting broad PII *shapes* here is a safety net on
// top of (not a replacement for) keeping call sites disciplined about
// what they put in `extra`/`contexts` (IDs only, never raw patient/
// customer/invoice records — see reportError's own doc comment).
const PHONE_RE = /\b\d{10}\b/g;
const EMAIL_RE = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g;

function redact(value: string): string {
  return value.replace(EMAIL_RE, "[redacted-email]").replace(PHONE_RE, "[redacted-phone]");
}

function scrubExceptionValues(event: ErrorEvent): void {
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = redact(exception.value);
  }
  if (event.message) event.message = redact(event.message);
  for (const crumb of event.breadcrumbs ?? []) {
    if (crumb.message) crumb.message = redact(crumb.message);
  }
}

export function scrubSentryEvent(event: ErrorEvent, _hint: EventHint): ErrorEvent | null {
  scrubExceptionValues(event);

  // Never send cookies/full headers even if something upstream set them —
  // a session cookie or auth header has no business leaving this process.
  if (event.request) {
    delete event.request.cookies;
    delete event.request.headers;
  }
  for (const exception of event.exception?.values ?? []) {
    if (exception.stacktrace) {
      for (const frame of exception.stacktrace.frames ?? []) {
        delete frame.vars;
      }
    }
  }

  return event;
}
