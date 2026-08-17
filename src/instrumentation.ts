import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "@/lib/observability/scrub";

/**
 * Phase 11.1: server-side Sentry setup, using this Next.js version's own
 * documented `instrumentation.ts` conventions (register + onRequestError)
 * rather than the older sentry.server.config.ts + withSentryConfig
 * pattern some Sentry docs still lead with — that pattern predates this
 * app's Next.js version's stable `onRequestError` hook.
 *
 * Works against either Sentry.io or a self-hosted GlitchTip instance —
 * both speak the same ingestion protocol, so only SENTRY_DSN's value
 * changes. Leave SENTRY_DSN unset to run with error tracking disabled,
 * same "opt-in, never crashes without it" convention as every other
 * third-party integration in this app (see .env.example).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" && process.env.NEXT_RUNTIME !== "edge") return;
  if (!process.env.SENTRY_DSN) return;

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    // Never send cookies/headers/IP by default — this app already blocks
    // that in scrubSentryEvent below, but sendDefaultPii itself defaults
    // to false; left explicit here so it can't be silently flipped on by
    // a future Sentry SDK default change.
    sendDefaultPii: false,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    beforeSend: scrubSentryEvent,
  });
}

// The officially documented helper for Next.js's onRequestError hook —
// covers uncaught errors from Server Component rendering, Route Handlers,
// Server Actions, and Proxy. Tenant/user context comes from the Sentry
// scope tags set in requireSession() (src/lib/rbac.ts), the one function
// nearly every server action already calls first.
export const onRequestError = Sentry.captureRequestError;
