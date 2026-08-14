<!-- Title: Security Audit Readiness -->

# Security audit readiness

This document does two things: it explains the automated dependency
scanning wired into CI, and it states plainly what security testing has
and has **not** been done on this codebase, so anyone relying on it —
an operator, an auditor, an investor doing diligence — isn't misled into
thinking more has happened than actually has.

## What has been done

- **Dependency vulnerability scanning**: `.github/workflows/security.yml`
  runs `npm audit --audit-level=high` on every push, every PR, and weekly
  on a schedule (to catch newly-disclosed CVEs in dependencies that were
  fine when installed). `.github/dependabot.yml` opens PRs automatically
  for outdated/vulnerable dependencies.
- **Optional Snyk scanning**: the same workflow runs a Snyk scan *if* a
  `SNYK_TOKEN` repository secret is configured (Settings > Secrets and
  variables > Actions in this repo). Without that secret the job no-ops
  cleanly rather than failing CI — Snyk requires an account this
  environment doesn't have one of, so it's wired up and ready but not
  actively running until an operator adds the token.
- **Static review during development**: RBAC (`requireRole`/`requireSession`
  in `src/lib/rbac.ts`) is checked server-side in every mutation, not just
  hidden in the UI. Row-Level Security (see the main README's
  Multi-tenancy section) provides a second, database-enforced layer of
  tenant isolation independent of application code correctness, verified
  by an automated cross-tenant test suite (`tests/rls-isolation.test.ts`,
  82 tests). SQL injection is structurally prevented — all data access
  goes through Prisma's parameterized queries; the only raw SQL in the
  codebase is the hardcoded `set_config(...)` calls RLS depends on, never
  string-interpolated with user input. Passwords are bcrypt-hashed.
  Webhook signatures (Razorpay) are HMAC-verified against the raw request
  body before any payload is trusted. API keys are SHA-256-hashed at rest
  and shown in plaintext exactly once, at creation.
- **`npm audit`**: zero vulnerabilities at the time this document was
  written (see the badge/output in CI for current status — this file
  isn't kept in sync with that automatically).

## What has NOT been done

**No penetration test has been performed on this application.** Nothing
in this repository, its CI configuration, or this document should be
read as claiming otherwise. Specifically absent:

- No third-party or internal red-team engagement.
- No dynamic application security testing (DAST) — no automated scanner
  (OWASP ZAP, Burp Suite, etc.) has been run against a live instance.
- No manual penetration testing of authentication, session management,
  RLS bypass attempts from an attacker's perspective, or business-logic
  abuse (e.g., race conditions in stock decrement, discount-cap bypass
  attempts beyond the automated test coverage that exists).
- No infrastructure/network penetration test (this repo doesn't control
  deployment infrastructure — see the Docker section of the main README).
- No fuzzing of API inputs beyond Zod schema validation's own guarantees.
- No formal threat model document exists for this application.

## Suggested scope for a real penetration test

If/when a real pen test is commissioned, these are the areas this
codebase's own architecture suggests prioritizing, roughly in order of
what a successful attack would cost the business most:

1. **Cross-tenant data isolation** — attempt to read or write another
   tenant's data via the authenticated app (not just the automated RLS
   suite, which tests the mechanism directly; a real test should attempt
   it through the UI/API as an attacker would, including parameter
   tampering, IDOR-style ID guessing, and any request that might bypass
   `requireSession`/`requireRole`).
2. **Public API v1** (`/api/v1/*`) — API key handling (leakage, guessing,
   replay), rate-limit bypass, and whether the deliberately-narrower
   `create-sale` endpoint's validation can be tricked into bypassing the
   prescription-item restriction or FEFO batch selection.
3. **Super-Admin console** (`/admin/*`) — the separate session mechanism
   (`src/lib/admin-auth.ts`) is hand-rolled rather than a vetted library;
   this is exactly the kind of code that benefits most from adversarial
   review. Attempt session forgery, fixation, and privilege escalation
   from a tenant-user session into admin territory.
4. **Payment/webhook flow** — Razorpay webhook signature verification,
   replay attacks, and whether a crafted webhook payload can flip a
   tenant's subscription status without a real payment.
5. **File upload paths** — prescription image uploads
   (`src/lib/prescription-storage.ts`) and the authenticated file-serving
   route's tenant/invoice cross-check.
6. **Authentication & session management** — MFA bypass attempts, session
   fixation, the sliding JWT idle-timeout implementation, and password
   reset flows if/when one is added (none exists as of this document).

## Keeping this document current

This file should be revisited whenever: a new externally-reachable
surface is added (a new API route, webhook, or public page), the auth
mechanism changes, or an actual security review/pen test is performed —
at which point its findings and remediation status belong here too.
