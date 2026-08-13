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
  queries; there is no raw SQL in the application code.
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

## Scope / what's not here

Deliberately out of scope for Phases 1–3 (see the original build specs for
the full lists): multi-tenant signup/billing, direct GST portal
API/e-invoicing/e-way bill integration, purchase scheme tracking (treated
as a manual rate adjustment, not a modeled entity), landed cost
calculation (GRN rate is a flat per-unit rate), multi-branch transfers,
supplier payment gateway/bank integration (manual ledger entry only),
scheme/loyalty discounts, cloud backup, Marg/Vyapar importers, Hospital
Mode, white-labeling beyond the basic logo/color/footer fields, AI
features, real payment gateway integration, SMS/WhatsApp notifications,
and multi-state GSTIN/IGST logic beyond the basic intra-state assumption.
The CSV import pipeline (`src/lib/import/`) is structured in independent
stages — parse → map → validate → commit — specifically so a
platform-specific pre-parser could be dropped in ahead of
`validate`/`commit` in a later phase without touching those two stages.

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
