import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "@/lib/observability/scrub";

// Phase 11.1: client-side half of the same Sentry setup as
// src/instrumentation.ts — see that file's comment for why this uses the
// Next.js-native instrumentation-client.ts convention instead of the
// older sentry.client.config.ts pattern. NEXT_PUBLIC_SENTRY_DSN (not
// SENTRY_DSN — this ships in the browser bundle, so it must be the
// public-prefixed env var) left unset runs with client-side error
// tracking disabled, same convention as the server half.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV,
    sendDefaultPii: false,
    tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    beforeSend: scrubSentryEvent,
  });
}

export function onRouterTransitionStart(url: string) {
  Sentry.addBreadcrumb({ category: "navigation", message: `Navigated to ${url}`, level: "info" });
}
