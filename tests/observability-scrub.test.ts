import { describe, it, expect } from "vitest";
import { scrubSentryEvent } from "@/lib/observability/scrub";
import type { ErrorEvent } from "@sentry/core";

// Phase 11.1: confirms the beforeSend hook actually redacts PII-shaped
// values rather than just existing — a scrubber nobody verified is
// equivalent to no scrubber at all.
describe("scrubSentryEvent", () => {
  it("redacts a 10-digit phone number embedded in an exception message", () => {
    const event: ErrorEvent = {
      type: undefined,
      exception: { values: [{ type: "Error", value: "Invalid phone number 9876543210 for customer" }] },
    };
    const scrubbed = scrubSentryEvent(event, {});
    expect(scrubbed?.exception?.values?.[0].value).toBe("Invalid phone number [redacted-phone] for customer");
  });

  it("redacts an email address embedded in an exception message", () => {
    const event: ErrorEvent = {
      type: undefined,
      exception: { values: [{ type: "Error", value: "Duplicate user for owner@demo-pharmacy.local" }] },
    };
    const scrubbed = scrubSentryEvent(event, {});
    expect(scrubbed?.exception?.values?.[0].value).toBe("Duplicate user for [redacted-email]");
  });

  it("redacts PII shapes from breadcrumb messages", () => {
    const event: ErrorEvent = {
      type: undefined,
      breadcrumbs: [{ message: "Sent WhatsApp to 9123456780", category: "whatsapp" }],
    };
    const scrubbed = scrubSentryEvent(event, {});
    expect(scrubbed?.breadcrumbs?.[0].message).toBe("Sent WhatsApp to [redacted-phone]");
  });

  it("strips cookies and headers from the request context entirely", () => {
    const event: ErrorEvent = {
      type: undefined,
      request: {
        url: "https://example.com/pos",
        cookies: { "next-auth.session-token": "secret-token-value" },
        headers: { authorization: "Bearer secret" },
      },
    };
    const scrubbed = scrubSentryEvent(event, {});
    expect(scrubbed?.request?.cookies).toBeUndefined();
    expect(scrubbed?.request?.headers).toBeUndefined();
    expect(scrubbed?.request?.url).toBe("https://example.com/pos");
  });

  it("strips local variables from stack frames", () => {
    const event: ErrorEvent = {
      type: undefined,
      exception: {
        values: [
          {
            type: "Error",
            value: "boom",
            stacktrace: { frames: [{ filename: "pos.ts", vars: { patientName: "Jane Doe" } }] },
          },
        ],
      },
    };
    const scrubbed = scrubSentryEvent(event, {});
    expect(scrubbed?.exception?.values?.[0].stacktrace?.frames?.[0].vars).toBeUndefined();
  });

  it("leaves tenantId tags and non-PII content untouched", () => {
    const event: ErrorEvent = {
      type: undefined,
      tags: { tenantId: "demo-tenant", action: "pos.completeSale" },
      exception: { values: [{ type: "Error", value: "Batch not found" }] },
    };
    const scrubbed = scrubSentryEvent(event, {});
    expect(scrubbed?.tags).toEqual({ tenantId: "demo-tenant", action: "pos.completeSale" });
    expect(scrubbed?.exception?.values?.[0].value).toBe("Batch not found");
  });
});
