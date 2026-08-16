# Pharmacy Billing — Phases 1–3 (Core Billing + Purchase & Inventory + Compliance)

A GST-compliant, keyboard-first counter-billing system for a single-tenant
retail pharmacy — extended with the supply side (purchase orders, GRN,
purchase returns, supplier ledger) and with regulatory compliance (Schedule
X narcotic register, GST/HSN/GSTR-ready reporting, prescription capture +
pharmacist sign-off, license expiry tracking). See
[Scope](#scope--whats-not-here) for what's deliberately out of scope for now.

## Stack

- **Next.js 16** (App Router, Turbopack), **React 19**, TypeScript
- **Tailwind CSS v4** + **shadcn/ui** (Radix primitives)
- **Zustand** for the POS cart
- **PostgreSQL** via **Prisma 7** (driver adapter: `@prisma/adapter-pg`)
- **NextAuth v5** (Credentials + TOTP-based MFA)
- Docker Compose for self-hosted deployment

## Getting started (local development)

Requires Node 20+ and a PostgreSQL 16 instance.

```bash
cp .env.example .env
# edit .env: set DATABASE_URL, generate NEXTAUTH_SECRET/AUTH_SECRET and
# BACKUP_ENCRYPTION_KEY (see the comments in .env.example for how)

npm install
npx prisma migrate deploy   # applies the existing migration
npm run db:seed             # creates a demo tenant, branch, users, items
npm run dev
```

Open http://localhost:3000. The seed script prints demo login credentials
(owner, pharmacist, and counter-staff accounts) and the manager PIN used for
discount-cap overrides — re-run `npm run db:seed` any time; it's idempotent.

Owner and pharmacist accounts are required to set up TOTP MFA on first
login (scan the QR code with any authenticator app). Counter staff MFA is
optional — it can be turned on from Settings → Security.

## Docker (self-hosted)

```bash
cp .env.example .env   # fill in real secrets — do not use the example values
docker compose up -d --build
docker compose exec app npx prisma migrate deploy
docker compose exec app npm run db:seed   # optional, for a demo dataset
```

The app listens on port 3000. **TLS is expected to be terminated in front of
this container** (a reverse proxy — nginx, Caddy, Traefik, your cloud LB) —
the app itself does not serve HTTPS. Set `NEXTAUTH_URL` to the public HTTPS
URL your proxy exposes.

### Scheduled backups

The "Backup now" button in Settings works regardless of any of this. For an
unattended daily backup, point a host-level cron at the app container:

```cron
0 2 * * * curl -sf -X POST http://localhost:3000/api/backup/scheduled \
  -H "x-backup-secret: $BACKUP_CRON_SECRET"
```

This writes an encrypted export to the `backups/` volume (already declared
in `docker-compose.yml`) and logs the attempt the same way a manual backup
does — it'll show up in Settings and count toward the 48h staleness check on
the dashboard.

### Scheduled refill reminders

Same pattern as scheduled backups above — the "Send reminders now" button in
Settings > Reminders works regardless of any of this. For an unattended daily
run, point a host-level cron at the app container:

```cron
0 9 * * * curl -sf -X POST http://localhost:3000/api/refill-reminders/scheduled \
  -H "x-refill-reminders-secret: $REFILL_REMINDERS_CRON_SECRET"
```

Checks every tenant with reminders enabled in Settings; a customer only
receives a message if their own opt-in (on their customer detail page) is
also on.

### Restoring a backup

Backup files are AES-256-GCM encrypted (`[12-byte IV][16-byte auth tag][ciphertext]`,
base64-encoded when downloaded from the browser). Decrypt with the same
`BACKUP_ENCRYPTION_KEY` used to create them:

```js
import { readFileSync } from "node:fs";
import crypto from "node:crypto";

const key = Buffer.from(process.env.BACKUP_ENCRYPTION_KEY, "hex"); // or base64
const payload = readFileSync("pharmacy-backup-....enc");
const iv = payload.subarray(0, 12);
const authTag = payload.subarray(12, 28);
const ciphertext = payload.subarray(28);
const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
decipher.setAuthTag(authTag);
const json = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
```

The decrypted JSON contains the tenant's branches, items, batches,
customers, doctors, and invoices (with line items and discounts) as of the
export time. Restoring it back into the database isn't automated in Phase
1 — the export exists so the data is recoverable, not as a one-click
restore flow yet.

## Security notes

- **TLS**: assumed to be terminated at the reverse proxy / load balancer in
  front of this app (see Docker section above). No app-level TLS handling.
- **Passwords**: hashed with bcrypt, never stored or logged in plaintext.
- **MFA**: TOTP secrets are stored in the database, never logged. Required
  for owner/pharmacist roles; optional for counter staff.
- **RBAC**: enforced server-side in every mutation (`requireRole()` /
  `requireSession()` in `src/lib/rbac.ts`), not just hidden in the UI —
  a counter-staff account calling an owner-only server action directly gets
  rejected regardless of what the client renders.
- **Audit log**: every price edit, stock adjustment, discount override,
  item import, and sale completion writes an `AuditLog` row with
  before/after values where applicable.
- **SQL injection**: all data access goes through Prisma's parameterized
  queries. The only raw SQL in the codebase is `SELECT set_config(...)` calls
  that set the Postgres session variables the Row-Level Security policies
  check (see Multi-tenancy below) — always with a hardcoded statement and a
  parameterized value, never string-interpolated user input.
- **Backups**: encrypted at rest (AES-256-GCM) before being written to disk
  or sent to the browser — see [Restoring a backup](#restoring-a-backup).
- **Session idle timeout**: configurable via `SESSION_IDLE_TIMEOUT_MINUTES`
  (default 15). Implemented as a sliding JWT expiry, not a hard
  server-tracked session store — acceptable for Phase 1's single-tenant
  scale, but worth knowing if you're auditing this.
- **Self-hosted auth trust**: `trustHost: true` is set in
  `src/auth.config.ts` because this app only ships as self-hosted Docker,
  never Vercel. This is safe *because* TLS termination and host validation
  are the reverse proxy's job — don't expose the app container directly to
  the internet without one.
- **Prescription images**: stored on local disk under
  `PRESCRIPTION_STORAGE_DIR` (default `./storage/prescriptions`), outside
  `public/`. Chosen over S3 for simplicity given this app's single-server
  Docker deployment — swap `src/lib/prescription-storage.ts` for an
  S3-compatible client if that ever changes. Files are only readable
  through the authenticated `/api/files/prescriptions/...` route, which
  cross-checks the requesting user's tenant against the invoice the path
  is attached to rather than trusting the URL. Back this directory up
  alongside the database if you rely on it for compliance records.

## Purchase & Inventory (Phase 2)

Extends the Phase 1 billing flow with the supply side, without changing it:

- **Suppliers** (`/suppliers`): name/GSTIN/address/payment-terms CRUD, plus a
  detail view with a running ledger and an outstanding balance that's always
  computed as `SUM(SupplierLedgerEntry.amount)` — never trusted from a cached
  column. Manual payments can be recorded against a supplier (amount + note).
- **Purchase orders** (`/purchase-orders`, optional): supplier + line items
  (item/qty/rate), draft → sent → received/cancelled status. A PO is never
  required before a GRN.
- **GRN — goods received** (`/grn`): the main daily-use screen. A fast
  repeated row-entry bar (item search → batch no. → mfg/expiry dates → MRP →
  rate → qty) where Enter commits a row and moves to the next; mfg date,
  expiry date, MRP, and rate carry forward between rows since a distributor
  invoice often repeats them, while item/batch no./qty always clear. Past
  expiry and MRP-below-rate show as inline non-blocking warnings, not
  errors. Saving creates/updates the matching `Batch` (matched by item +
  batch no.), increments its stock, writes a `SupplierLedgerEntry`, and — if
  linked to a PO — marks it received. Stock is visible in the POS batch
  picker immediately after saving.
- **Purchase returns** (`/purchase-returns`): from a GRN's "Return items"
  link or standalone. Select item + batch + qty + an overall reason;
  decrements `Batch.currentQty` (rejected server-side if it exceeds current
  stock) and writes a negative `SupplierLedgerEntry`. Detail view renders a
  printable (A4) debit note.
- **Alerts** (`/alerts`, linked from the dashboard): low-stock items (with
  last purchase rate/supplier for reorder reference) and near-expiry/expired
  batches, reusing the same `nearExpiryWindowDays` tenant setting Phase 1's
  in-list badges use. Each low-stock row links directly into GRN entry,
  pre-filled with that item.

## Compliance (Phase 3)

- **Narcotic / Schedule X register** (`/reports/narcotic-register`,
  Owner/Pharmacist only): every Schedule X sale writes a
  `NarcoticRegisterEntry` automatically inside the same transaction as the
  sale. Insert-only at the application level — there are no update/delete
  actions for it. Corrections are a separate linked reversal row
  (`reversalOfId`), never an edit to the original, so the register stays a
  faithful record of what was actually dispensed. Listed oldest-first (a
  bound register is read top to bottom), with CSV export and an A4-landscape
  print view for inspection.
- **GST invoice formatting**: receipts show CGST/SGST as two separate
  amounts (per line and in the total) instead of one combined figure,
  re-deriving the intra-state 50/50 split `billing.ts` already computes —
  no new stored value. An **HSN-wise summary** report (`/reports/hsn-summary`)
  aggregates taxable value/tax by HSN code and rate for a selected period,
  with CSV export.
- **GSTR-1 / GSTR-3B export** (`/reports/gstr-export`, Owner/Pharmacist
  only): three CSVs an accountant can use directly — GSTR-1 Table 7 (B2C
  small, by place-of-supply and rate), GSTR-1 Table 12 (HSN summary, in the
  offline tool's column layout), and GSTR-3B Table 3.1 (outward-supplies
  summary). No GST portal API integration — output only. No B2B sheet:
  `Customer` has no GSTIN field in this schema (walk-in retail only), so
  every sale is inherently B2C.
- **Prescription capture + pharmacist sign-off**: optional prescription
  photo upload on Schedule H/H1/X sales (see
  [Security notes](#security-notes) for how images are stored). A
  Pharmacist or Owner at the till signs off via their own session
  automatically; Counter Staff must have a Pharmacist/Owner re-authenticate
  (email + password) in a dialog before the sale finalizes —
  `completeSale` re-verifies those credentials server-side rather than
  trusting the client.
- **License expiry tracking**: a Compliance tab in Settings
  (Owner/Pharmacist only) captures each license's number and expiry date
  (retail/wholesale drug license, narcotic license, FSSAI registration) and
  a configurable renewal-warning window (default 60 days). Surfaced on the
  *existing* Alerts screen (a "License renewals" section, not a separate
  screen) and as a dashboard banner, with severity escalating from
  "upcoming" to "urgent" (≤15 days) to "expired". A license lapse is a
  warning, not a billing block — that's a deliberate business decision to
  revisit later, not an oversight.

## Integrations & offline hardening (Phase 5)

- **Credit customer ledger**: `Customer.outstandingBalance` is now a cache
  column only — the real balance is `SUM(CustomerLedgerEntry.amount)`
  (mirrors the Supplier ledger from Phase 2). Every credit sale writes a
  `sale` entry; a customer detail page (`/customers/[id]`) lets staff
  record `payment` entries and view a printable, CSV-exportable statement
  of account (`/customers/[id]/statement`) with opening/closing balance.
- **WhatsApp receipt/statement delivery**: uses
  [Gupshup](https://www.gupshup.io/developer/docs/bot-platform/guide/whatsapp-api-documentation)'s
  WhatsApp Business API. Set `GUPSHUP_API_KEY`, `GUPSHUP_SOURCE_NUMBER`, and
  `GUPSHUP_APP_NAME` (see `.env.example`) — without them, the "Send via
  WhatsApp" button (on the receipt and statement pages) reports "not
  configured" instead of crashing, and every attempt is logged to
  `WhatsAppLog` either way. **What's actually sent is a formatted text
  summary, not a PDF/image attachment** — this app's other "PDF" exports
  are all browser print-to-PDF (no server-side document rendering exists
  anywhere in the codebase), so there's no pipeline to attach a receipt
  image to a WhatsApp message yet. Adding one (headless rendering + hosting
  the resulting file for Gupshup's document-message API) is a real,
  reasonably-sized follow-up, not something faked here.
- **E-invoice (IRN) & e-way bill generation**: against a GSP (GST Suvidha
  Provider) API compatible with the NIC IRP schema most Indian GSPs
  (ClearTax, MasterGST, Cygnet) wrap — set `GSP_BASE_URL`, `GSP_API_KEY`,
  and `GSP_SELLER_GSTIN` (see `.env.example`) once a provider account is
  provisioned; unset, generation attempts report "not configured".
  E-invoicing is gated by a per-branch `einvoiceEnabled` toggle
  (Branch edit screen) standing in for the turnover-threshold check, since
  that threshold is government policy that changes over time, not a
  constant to hardcode. E-way bill generation is gated by a configurable
  per-branch value threshold (`ewayBillThreshold`, default ₹50,000) — value
  only; distance-based thresholds aren't implemented since nothing in this
  app calculates distance (no geocoding). Both calls are fire-and-forget
  after the sale/GRN transaction already committed — never awaited by the
  checkout or GRN-save response — so a slow or down GSP adds zero latency
  to the counter. A failed attempt leaves the IRN/e-way bill number null;
  a "Generate e-invoice" / "Generate e-way bill" button appears on the
  receipt (and GRN detail) screen to retry manually. A successful IRN
  renders as a QR code (via the `qrcode` package, same one used for MFA
  setup) directly on the printed receipt.
- **Offline-first POS billing**: scoped specifically to the billing screen
  and printing, not the whole app. A `navigator.onLine`-plus-real-ping
  check (`/api/health`) drives a persistent, unmissable status bar — never
  a dismissible toast — showing "Offline — N bills pending sync." While
  offline, item search keeps working off the already-loaded catalog
  (backed by an IndexedDB cache, via Dexie, refreshed on load and every 3
  minutes while online, so a long-open tab survives a reload mid-shift
  too), and completing a sale writes it to an IndexedDB queue instead of
  calling the server, immediately showing a locally-rendered, printable
  receipt built entirely from client-side state — no round-trip. On
  reconnection the queue replays automatically, in order, against the same
  `completeSale` action used online (idempotent via a client-generated
  `offlineClientId`, so a retried sync can't double-bill); a batch sold
  below available stock by another terminal in the meantime surfaces as a
  distinct "conflict" in the queue panel for manual reconciliation, never
  silently oversold or dropped. **Deliberately blocked while offline**
  (each needs a real-time server check that can't be safely approximated
  from cached state): credit-mode sales (ledger validation), a discount
  above the staff cap (manager PIN verification), and prescription sales
  for non-pharmacist/owner roles (pharmacist re-auth) — each shows a clear
  inline reason rather than silently failing or behaving unsafely. Live-
  verified end to end via Playwright with `context.setOffline()`: item
  search and cart entry while offline, the offline receipt overlay,
  automatic sync on reconnection, and a real stock-conflict surfaced
  correctly (one of two queued sales for the same nearly-out-of-stock
  batch synced, the other flagged, stock never went negative).

## Multi-tenancy & go-to-market (Phase 6)

### Row-Level Security (real multi-tenancy, not just a column)

Every table scoped by `tenantId` — 21 directly, plus 6 line-item tables
scoped indirectly via an `EXISTS` subquery into their parent (`Batch`,
`SalesInvoiceItem`, `PurchaseOrderItem`, `GrnItem`, `PurchaseReturnItem`,
`StockTransferItem`) — now has a Postgres Row-Level Security policy, with
`FORCE ROW LEVEL SECURITY` since the app connects as the table-owning role
(which bypasses RLS by default otherwise). This is a **second, DB-enforced
layer** on top of the application-layer `WHERE tenantId = ?` filtering that
already existed — if a future code change ever forgets a tenant filter, the
database itself still refuses to leak or accept cross-tenant rows. See
`prisma/migrations/20260814000000_add_row_level_security/migration.sql`.

Per-request tenant context is set via `SELECT set_config('app.current_tenant_id', ...)`
inside a Prisma Client Extension (`src/lib/prisma.ts`), resolved from
`auth()` — NextAuth's session lookup, reliably memoized per request by
Next.js — rather than `AsyncLocalStorage`. An earlier design used
`AsyncLocalStorage.enterWith()` from the shared `requireSession()`
chokepoint, which looked simpler but was empirically wrong: a mutation made
inside an awaited helper does not survive back to the awaiting caller,
because the caller's post-await continuation captures its async context at
the moment it *calls* the helper, not when the helper returns. Multi-step
writes that must be atomic (`completeSale`, `createGrn`, purchase returns,
stock transfers) use `runInTenantTransaction()` instead of
`prisma.$transaction()` directly — wrapping an already-transactional query
in a second implicit transaction was found to silently break atomicity (a
rolled-back sale could leave its stock decrement committed).

A narrow `app.rls_bypass` escape hatch, scoped per-transaction and never
left set on a pooled connection, covers the few legitimate pre-tenant-
context paths: the login email lookup, the seed script, the scheduled
backup cron listing all tenants, and the Super-Admin console.

**Test suite**: `tests/rls-isolation.test.ts` (`npm test`) seeds two full
tenants — one row in every RLS-protected table — and asserts at the
database level, not app logic, that: reads/writes/inserts can't cross a
tenant boundary, `findMany` never leaks a row, the default with no tenant
context is fail-closed even for the table-owning role, and the bypass
mechanism trusted internal code relies on actually works. 82 tests total
across that suite plus the Marg/Vyapar import-parsing tests below.

### Self-service signup & onboarding

`/signup` creates a fully isolated tenant (tenant + branch + owner user + a
14-day free trial, no payment required) in one RLS-bypassed transaction —
the one legitimate case for writing a `Tenant` row with no existing tenant
context — then signs the owner in immediately. A first-run checklist on
the dashboard (branch set up / items added / first sale made) is derived
from real tenant data rather than a stored "onboarded" flag, and links
straight to the existing CSV importer in Settings rather than duplicating
it.

### Subscription billing (Razorpay)

`SubscriptionPlan` (a shared, unprotected catalog — no `tenantId`, so
deliberately outside RLS, the same way a price list isn't "tenant data")
and `TenantSubscription` (RLS-protected like everything else) back four
seeded tiers: Free Trial, Growth, Premium, Enterprise (contact-sales only,
no self-serve checkout). Settings > Billing shows the current plan, usage
against its limits, and upgrade buttons. `checkPlanLimit()`
(`src/lib/plan-limits.ts`) gates plan-capped actions — currently branch
creation — with an actionable "upgrade to add more" message instead of a
bare failure.

Razorpay integration (`src/lib/razorpay/client.ts`) follows this app's
established provider pattern (WhatsApp/GSP in Phase 5): plain `fetch` over
the REST API, reporting "not configured" rather than crashing when
`RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` are unset. A subscription's plan
only actually switches on a signature-verified `/api/webhooks/razorpay`
callback (HMAC-SHA256 over the raw request body against
`RAZORPAY_WEBHOOK_SECRET`), never optimistically at checkout-start, since
the customer can still abandon payment. **Not tested against a live
Razorpay sandbox** — no credentials were available in the environment this
was built in. What *was* verified: the webhook signature check (valid
signature accepted, invalid rejected with 401) and the webhook-driven
`trialing -> active` status transition, using a hand-crafted signed
payload against a running instance of the app. Before going live: create
one Razorpay Plan per priced tier (dashboard or `POST /v1/plans`), store
the returned id on `SubscriptionPlan.razorpayPlanId`, and set the three
env vars above.

### Super-Admin console

`/admin/*` uses a deliberately separate session mechanism from tenant
users — a hand-rolled HMAC-signed cookie (`src/lib/admin-auth.ts`), not a
second NextAuth instance, so the trust boundary is obvious and it never
touches tenant RLS/session machinery. Lets platform staff list tenants,
view a tenant's branches/users/invoice count, suspend/reactivate access,
override a tenant's plan directly (for support cases, outside the normal
Razorpay flow), and see a churn report (cancelled subscriptions + trials
that expired unconverted). Suspension is enforced at login
(`src/auth.ts`) independent of subscription status — it gates access
entirely; billing gates usage. Seeded operator login:
`admin@platform.local` / `PlatformAdmin@12345` — change this before any
real deployment.

### White-labeling

A Branding settings tab (logo URL, primary color, receipt footer, live
preview) is wired into the app shell sidebar and every printed/emailed
receipt. The tiered "Powered by Pharmacy Billing" line
(`src/lib/branding.ts`) is driven entirely by the tenant's current plan —
never a manual toggle — so it can't be suppressed without actually being
on a white-label plan. Custom domain + DNS verification (a real
`_pharmacy-verify.<domain>` TXT lookup via Node's `dns.resolveTxt`, not a
fake progress bar) is gated to white-label plans at the settings-action
layer rather than the database, so a plan downgrade doesn't silently wipe
a tenant's saved domain — it just stops them from re-verifying it.
Actually pointing a custom domain at this app (reverse-proxy / DNS CNAME
config) is a deployment-time step outside this repo's scope.

### Public API (v1)

`/api/v1/{invoices,stock,customers,sales}` plus `/api/v1/openapi` (a
hand-written OpenAPI 3.0 spec). Auth is a SHA-256-hashed API key
(`Authorization: Bearer phk_...`, shown once at creation in Settings >
API), resolved the same way the login/webhook bootstrap cases are — the
RLS bypass flag, scoped to one lookup transaction. Rate limiting is an
in-memory sliding window, 60 requests/minute per key — **per-instance**,
matching this app's documented single-process self-hosted deployment (see
Scaling readiness below); it would need a shared store (Redis etc.) behind
a load balancer running more than one instance.

`POST /api/v1/sales` is deliberately narrower than the in-app POS screen:
FEFO batch auto-selection, no prescription items (Schedule H/H1/X sales
still need the POS UI's pharmacist sign-off — the API rejects them
outright with a clear error), no discounts/schemes/coupons. That's a
considered scope boundary, not a missing feature — a safe, correct v1
surface for headless integrations (an e-commerce storefront, say) without
reimplementing or risking the POS's full business-rule engine.

### Scaling readiness

**Load test**: 200 requests (20 concurrent workers x 10 sequential
requests each) against `/api/v1/stock` on a `next dev` instance completed
with zero non-rate-limit errors; p50 369ms, p95 872ms. Most of that per-
request latency is dev-mode overhead (`next dev` compiles on demand and
the RLS extension's `set_config` + query pattern is two round trips per
call) — re-run against a production build (`npm run build && npm start`)
for representative numbers before drawing capacity conclusions. 140/200
requests correctly hit the 60/minute rate limit under that burst, which is
the limiter working as designed, not a failure.

**N+1 fixes made during this phase**: the CSV import commit path
(`src/lib/actions/import.ts`) issued one `findFirst` query per row to
check whether an item already existed — replaced with a single batch
`findMany` before the loop, since the new Marg/Vyapar importers below make
large (hundreds-of-rows) imports more likely. `completeSale`'s
`checkDiscountCap` (`src/lib/actions/pos.ts`) re-fetched the tenant row
once per cart line plus once for the bill discount — a cart with a dozen
lines meant a dozen-plus redundant queries on the hottest path in the app;
now fetched once and passed through.

**Connection pooling**: this app uses a single `pg.Pool` per process via
`@prisma/adapter-pg` (see `src/lib/prisma.ts`), sized by the driver's
defaults. That's adequate for the single-process self-hosted deployment
this repo ships (see the Docker section above) at low-to-moderate tenant
counts. As tenant count and concurrent request volume grow, put
[PgBouncer](https://www.pgbouncer.org/) (transaction-pooling mode) in
front of Postgres and point `DATABASE_URL` at it instead — this
particularly matters here because the RLS extension issues a `set_config`
+ query pair as an array-batched transaction on every non-interactive
call, meaning connection acquisition happens on essentially every request;
pooling at the Postgres level, not just the Node process level, is what
absorbs that at scale. No PgBouncer config is checked into this repo — it's
an infra-level decision for whoever operates a given deployment.

**Caching**: no application-level cache (Redis, in-memory TTL cache, etc.)
exists yet. The read-heavy public API endpoints (`/api/v1/stock` and
`/api/v1/customers` especially) are the first candidates if/when query
volume from external integrations warrants it — they're pure reads with
no side effects, making them safe to cache with a short TTL keyed by
tenant + query params.

### Marg & Vyapar CSV importers

`src/lib/import/marg-parser.ts` and `vyapar-parser.ts` are pre-parsers
that recognize each tool's common export column names and feed the
*existing* Phase 1 import pipeline (`src/lib/import/{fields,normalize,validate}.ts`)
directly, in the same `NormalizedRow` shape the manual column-mapping step
already produces — this was a deliberate seam left in that pipeline from
Phase 1 specifically for this. Selecting "Marg" or "Vyapar" as the export
format in Settings > Import/Export skips the manual mapping step and goes
straight to the validation preview; there's no separate importer screen.

**Expiry-date handling** (`src/lib/import/date-parse.ts`) is the part
worth understanding if you're extending this: Indian day-first dates
(`DD-MM-YYYY` / `DD/MM/YYYY`) are parsed with an explicit regex, never
handed to `new Date(string)` — for an ambiguous date like `05/08/2026`,
`new Date()` silently parses it as May 8th (US month-first) instead of
5th August, which is wrong without ever raising an error. Marg's common
convention of recording batch expiry as month/year only (e.g. `08/26`) is
resolved deterministically to the *last day* of that month — an
established pharma-industry convention for a month/year-only expiry, not a
per-row guess. Anything that doesn't match either recognized pattern is
left completely unchanged, so it visibly fails the existing "is this a
valid date" validation and shows up as a flagged row in the preview table
— never silently dropped, and never guessed. `tests/import-marg-vyapar.test.ts`
locks down the ambiguous-date and unrecognized-format cases specifically.

Both pre-parsers were verified against hand-built sample files matching
each tool's typical export shape through the real running app (upload,
preview showing correct flags, commit, resulting items/batches correct)
— not just the unit tests. Real-world exports can vary by tool version;
the column-alias lists in both parser files are the place to extend if a
particular pharmacy's export doesn't auto-map.

### Security audit readiness

See [`docs/security-audit-readiness.md`](docs/security-audit-readiness.md)
for CI dependency-scanning setup and — importantly — an explicit statement
of what security testing has and has **not** been done on this codebase
(no penetration test has been performed; this documents scope for one,
not a substitute for one).

## Hospital Mode (Phase 7)

A tenant-level toggle (`tenants.tenantType`, `retail` or `hospital`), not a
fork of the product. A retail tenant never sees or can route to anything
below — every Hospital Mode page calls `requireHospitalTenant()`
(`src/lib/hospital-scope.ts`), which 404s outright for a non-hospital
tenant, and the sidebar nav filters the same way (`app-shell.tsx`'s
`hospitalOnly` flag). A hospital's outpatient counter keeps using the exact
same POS/`SalesInvoice` path retail does; this phase is entirely the
inpatient (IPD) side layered on top. Pick "Hospital" at signup, or have a
super-admin flip an existing tenant's type from the admin console.

**Ward/sub-store stock hierarchy.** `Ward` (ICU/OT/general/pharmacy
sub-store, created per-branch in Settings > Wards) is a stock location one
level deeper than `Branch` — `batches.wardId` is nullable, exactly
mirroring how `batches.branchId` was added in Phase 4: `null` is
central/branch-level stock, set is ward-scoped stock. The same batch number
never splits across locations; moving stock to a ward creates/updates that
ward's own `Batch` row, the same principle Phase 4's stock transfers use
between branches.

**Indents** (`src/lib/actions/indents.ts`, modeled directly on Phase 4's
stock-transfer request/approve flow) are how a ward gets stock: a Ward
Nurse requests an item and quantity (no batch — they don't pick one), a
Ward/Duty Pharmacist or Pharmacist reviews the queue (current central
stock, FEFO-suggested batch with room to override) and issues fully,
partially, or rejects in one decisive action. Issuing decrements the
central batch and creates/increments the ward's own batch row, writing an
`AuditLog` entry.

**Patient admissions** (`PatientAdmission`) are deliberately minimal — an
admission reference, patient name, and ward, not an EMR. IPD dispensing
happens directly from the ward's own stock (no separate transfer step,
same discipline as POS `completeSale`) and does **not** create a
`SalesInvoice`; dispenses accumulate against the admission as consumption
records for an external HIS to bill from. Unused-medicine returns live on
the same screen as dispensing (`IpdDispense.returnedQty`), incrementing the
ward batch back.

**Roles**: `ward_nurse` can create indents and record dispenses/returns for
their assigned ward(s) only (`WardAssignment`, enforced server-side via
`assertWardAccess` — not just filtered in the UI) and is explicitly
excluded from retail billing/purchasing (`requireRetailSession` in
`rbac.ts`). `ward_pharmacist` is treated as `pharmacist` everywhere that
role is already checked — POS prescription sign-off, purchasing approvals,
MFA requirement — plus indent approval; it's an additive permission, not a
separate parallel set. Staff accounts (including these two roles) are
created in Settings > Staff, the one place additional users get created at
all — a gap that predated this phase and had to be filled for ward roles
to be assignable to anything.

**Public API extension** (`/api/v1/wards`, `/api/v1/wards/{id}/stock`,
`/api/v1/wards/{id}/consumption`, `/api/v1/admissions`,
`/api/v1/admissions/{ref}`) uses the exact same API-key/rate-limit
mechanism as Phase 6's endpoints and rejects with 403 on a non-hospital
tenant. It's built generically for any hospital's HIS to consume — nothing
here is specific to this team's own separate Hospital OS project, which
would just be one API consumer among others if it integrates later (that
integration work is explicitly not part of this phase).

**Explicitly out of scope**, per this phase's own spec: hospital billing
itself (this phase produces the consumption data an external HIS bills
from, not an invoice), a full EMR, and direct Hospital OS integration work.

## Phase 8: AI, analytics & ecosystem integrations (in progress)

Built as a series of independent, user-confirmed checkpoints rather than
one pass — see this phase's own spec for why (highest scope-creep risk in
the plan). Sections below are added as each checkpoint lands.

### Cloud backup (Google Drive & OneDrive)

Extends the Phase 1 local/manual backup with per-tenant OAuth-connected
cloud destinations, in Settings > Backup. Every upload is the exact same
AES-256-GCM-encrypted file the local backup already produces
(`src/lib/backup-crypto.ts`) — the cloud provider only ever stores
ciphertext. `CloudBackupConnection` (RLS-protected) holds the OAuth
tokens, themselves encrypted at rest with that same helper rather than a
second scheme. The OAuth round trip uses a signed, stateless CSRF token
(`src/lib/cloud-backup/oauth-state.ts`, same HMAC-over-JSON shape as
`admin-auth.ts`'s session cookie, 10-minute TTL) instead of server-side
state storage.

`src/lib/cloud-backup/google-drive.ts` and `onedrive.ts` follow this app's
established provider pattern (Razorpay in Phase 6): plain `fetch`,
`isXConfigured()` checks, `{ ok, data?, note? }` results, "not configured"
rather than a crash when env vars are unset. To go live: register OAuth
apps with Google Cloud Console / Microsoft Entra, add
`<NEXTAUTH_URL>/api/oauth/{google-drive,onedrive}/callback` as redirect
URIs, and set `GOOGLE_DRIVE_CLIENT_ID`/`GOOGLE_DRIVE_CLIENT_SECRET` and/or
`ONEDRIVE_CLIENT_ID`/`ONEDRIVE_CLIENT_SECRET`. The scheduled backup route
(`/api/backup/scheduled`) uploads to every connected destination per
tenant automatically; a failed cloud upload never fails the local backup
that already succeeded, and every attempt (success or failure, any
destination) logs to the same `BackupLog` the local backup always has.

**Not tested against real Google/Microsoft OAuth credentials** — none
were available in the environment this was built in, the same caveat
Razorpay had in Phase 6. What *was* verified against the real, running
app: the full Settings UI (connect/disconnect, configured-vs-not badges),
and — with a connection seeded directly and a placeholder token — a
"Backup now" click that made a genuine HTTP request to Google's live Drive
API and correctly surfaced Google's own real authentication-failure
response as a toast, with the attempt logged to `BackupLog` as `failed`
and the connection cleanly removable via Disconnect. The one thing that
couldn't be exercised is a successful upload, which needs a real access
token.

### AI-assisted reorder, expiry-risk & substitute suggestions

Deliberately a simple, explainable statistical rule
(`src/lib/actions/alerts.ts`), not a model — every number the UI shows is
exactly what drove the suggestion, per this phase's own design direction
("owners need to trust and understand a suggestion, not just receive
one").

- **Reorder suggestions**: a new section on the existing Alerts screen
  (not a separate screen), ranked by urgency. Sales velocity is a trailing
  30-day moving average (`VELOCITY_WINDOW_DAYS`); an item surfaces when
  its current stock would run out within 14 days
  (`REORDER_DAYS_THRESHOLD`) at that pace — shown as "Selling ~X/week
  over the last 30 days — Y days of stock left", linking straight to
  Create GRN pre-filled, the same pattern the existing Low Stock section
  already uses. Items with zero recent sales are deliberately excluded —
  there's nothing to extrapolate from, and suggesting a reorder with no
  real reasoning behind it would violate the whole point of this being
  explainable.
- **Expiry-risk**: a refinement of the existing Near Expiry alert, not a
  new category — batches that are both near-expiry *and* slow-moving
  (fewer than 5 units sold in the last 30 days, the same concept as
  Reports > Movers' `isSlowMover`, just a fixed default rather than that
  report's configurable threshold) get an extra "High risk — slow mover"
  badge and sort to the top of the list, since that specific combination
  is what actually causes write-off loss.
- **Substitute suggestions**: `getPosData` now returns every tenant item,
  not just ones currently in stock at the branch (previously filtered
  out entirely) — an out-of-stock item's search result shows an "Out of
  stock" badge plus up to a handful of in-stock items sharing the same
  `composition` or `genericName` field as inline clickable pills
  (`src/components/pos/search-panel.tsx`), added to the cart directly on
  click. A plain field-equality lookup against Item master, exactly as
  scoped — no model involved.

Verified live against a real running instance: real POS sales built real
sales-velocity data driving a real reorder suggestion (with the exact
"days of stock left" math checked), a seeded near-expiry+zero-sales batch
correctly flagged high-risk, and searching a real zero-stock item in POS
surfaced its real in-stock substitute, clickable straight into the cart.

### Owner cross-branch analytics dashboard

A new `/analytics` page (owner-only — nav item and page both gated), deliberately
the one report in the app that does *not* apply the usual branch-scope
filter (`src/lib/branch-scope.ts`): consolidating across every branch is
the entire point, with branches broken out explicitly in the branch
performance chart rather than narrowed to whichever one is selected in
the header switcher elsewhere.

- **Sales trend** and **margin trend**: two separate line charts (never
  one dual-axis chart mixing ₹ and % scales) — server-side aggregated by
  day from `SalesInvoiceItem`, same single round-trip query feeding all
  four sections below for a full date range without regressing to
  client-side computation.
- **Branch performance**: one ranked bar chart, best performer tinted
  green and lowest tinted red — "top/bottom" is the same sorted list read
  from either end, not two separate charts. Revenue/cost/margin use the
  exact same per-line definition (`qty*rate - discountAmount`, `qty *
  batch.purchaseRate`) `src/lib/actions/margin-movers.ts` already
  established, so this dashboard's numbers agree with the existing Margin
  Report rather than introducing a second "revenue" definition.
- **Staff performance**: reuses `getDiscountReport` (Phase 4) directly for
  discount-given. Sales volume has no dedicated field anywhere —
  `SalesInvoice` never recorded who rang it up (only who signed off a
  prescription) — so it's attributed via the existing `sale.complete`
  `AuditLog` entries instead of a schema change; the audit trail supplies
  only the attribution (which user, which invoice), the rupee figures
  still come from `SalesInvoice` itself, so this section's numbers agree
  with the rest of the page too.

Charts use `recharts` with the app's existing theme tokens
(`var(--primary)`, `var(--success)`, `var(--destructive)`, `var(--border)`,
etc.) rather than a hardcoded palette, so they follow light/dark mode
automatically. Verified live against a real running instance: real sales
rung up across two real branches, checked the dashboard's totals against
the actual per-branch/per-staff numbers by hand, and confirmed every
section (including staff revenue) agrees with the header total —
deliberately checked for exactly the kind of same-page inconsistency a
scrutinizing owner would notice.

### Refill reminders via WhatsApp

Detects a customer's repeat-purchase habit per item and sends a WhatsApp
nudge shortly before they're likely due to reorder — reusing the Phase 5
delivery mechanism (`sendWhatsAppMessage`) and the `reminder`
`WhatsAppMessageType` that already existed in the enum but was unused
until now, not a new integration.

- **Detection** (`src/lib/refill-reminders/detect.ts`): for each opted-in
  customer, groups their completed sales by item over a trailing 365-day
  window, and for any item bought twice or more, projects the next
  expected purchase date from the average interval between past
  purchases of that item — the same explainable-statistics approach as
  Checkpoint 2's reorder suggestions, no model. A reminder is due when
  that projected date falls within the next 3 days
  (`LEAD_DAYS`) or up to 14 days in the past (`STALE_DAYS`) — far enough
  past and the prediction is treated as stale (they likely refilled
  elsewhere) rather than sent as noise.
- **Opt-in, two levels**: off by default at both. `Tenant.refillRemindersEnabled`
  (Settings > Reminders, owner-only) is the pharmacy-wide kill switch;
  `Customer.refillRemindersOptIn` (a toggle directly on the customer's
  detail page) is per-customer. A customer is only ever messaged with
  both on.
- **Dedupe, exactly once per cycle**: `RefillReminder` records the anchor
  purchase (`lastPurchaseDate`) each attempt was computed from, with a
  unique constraint on `(customerId, itemId, lastPurchaseDate)` — so a
  cycle is never re-messaged on a later run regardless of whether the
  first attempt succeeded or failed, without relying on a fuzzy
  date-window check that could drift between runs.
- **Delivery**: same `sendWhatsAppMessage` provider as receipts/statements,
  logged to the same `WhatsAppLog` table with `messageType: "reminder"`.
  A pharmacy without Gupshup credentials configured gets the same
  friendly "not configured" failure as every other WhatsApp send, not a
  crash.
- **Two ways to run it**: the owner's "Send reminders now" button in
  Settings (single tenant, on demand), and `POST
  /api/refill-reminders/scheduled` for an external cron — same
  shared-secret-header pattern as `/api/backup/scheduled`
  (`REFILL_REMINDERS_CRON_SECRET`), and excluded from the auth middleware
  matcher the same way that route is.

Verified live against a real running instance: backdated two real sales
of the same item 20 days apart for an opted-in customer, confirmed the
detection math ("due ~1 day ago" from a ~20-day habit) correctly flagged
it, ran the real send (which correctly reported Gupshup "not configured"
since no real credentials exist in this environment — same caveat as
Checkpoint 1's cloud providers), confirmed the `RefillReminder` and
`WhatsAppLog` rows landed correctly, ran it a second time and confirmed
no duplicate reminder was created for the same cycle, and confirmed the
customer detail page renders both the opt-in toggle and the reminder
history. Also confirmed the scheduled route rejects a bad shared secret
(401) and accepts the real one.

## Scope / what's not here

Everything Phases 1–5 deliberately deferred — multi-tenant signup/billing,
Marg/Vyapar importers, white-labeling beyond basic fields, a public API,
real payment gateway integration — shipped in Phase 6; Hospital Mode
shipped in Phase 7 (see above). What's still deliberately out of scope:
AI-assisted features, a full self-serve SaaS billing-history UI (Settings >
Billing shows the current plan and lets you switch — there's no invoice
history/PDF receipts screen), and marketplace/accounting integrations.
Also still out of scope from earlier phases: direct GST portal
API integration beyond the GSP-compatible e-invoice/e-way bill provider
(Phase 5), purchase scheme tracking (treated as a manual rate adjustment,
not a modeled entity), landed cost calculation (GRN rate is a flat
per-unit rate), and multi-state GSTIN/IGST logic beyond the basic
intra-state assumption.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run start` | Run a production build (`next start`) |
| `npm run lint` | ESLint (flat config, `eslint.config.mjs`) |
| `npm run db:seed` | Seed demo tenant/branch/users/items (idempotent) |
| `npx prisma studio` | Browse the database |
| `npx prisma migrate dev` | Create/apply a migration in development |

## Project structure

```
prisma/schema.prisma       Database schema (every table carries tenantId)
prisma.config.ts           Prisma 7 config (datasource URL, migrations path)
src/auth.ts, auth.config.ts  NextAuth v5 setup (auth.config.ts is Edge-safe,
                              used by src/proxy.ts; auth.ts adds the
                              Credentials provider + Prisma/bcrypt)
src/lib/actions/           Server actions (one file per feature area)
src/lib/billing.ts         Shared GST/discount math (client + server)
src/lib/serialize.ts       Decimal -> number conversion for RSC boundaries
src/components/pos/        The POS billing screen
src/components/receipt/    Thermal (58/80mm) + A4 receipt renderer
src/components/purchasing/ Supplier/PO/GRN/return forms and detail views
src/lib/import/            CSV import pipeline (parse/map/validate stages)
```
