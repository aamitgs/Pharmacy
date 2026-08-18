-- Adds per-key scopes to public API keys.
--
-- Until now any valid key could call every /api/v1 route, including
-- POST /v1/sales (which decrements batch stock and creates invoices) and the
-- customer list. A key lives in someone else's config file, so one leaking
-- exposed the whole tenant rather than the job it was issued for.
--
-- Existing keys are backfilled with the full set so live integrations keep
-- working across the deploy. That leaves them over-privileged by design
-- rather than by accident: Settings > API marks a key holding every scope as
-- "full access" so an owner can reissue it narrower. New keys pick their
-- scopes explicitly and default to nothing.

-- AlterTable
ALTER TABLE "api_keys" ADD COLUMN "scopes" TEXT[] NOT NULL DEFAULT '{}';

-- Backfill: preserve the behaviour existing keys already had.
UPDATE "api_keys"
SET "scopes" = ARRAY[
  'stock:read',
  'customers:read',
  'invoices:read',
  'sales:write',
  'wards:read',
  'admissions:read',
  'admissions:write'
]
WHERE "scopes" = '{}';
