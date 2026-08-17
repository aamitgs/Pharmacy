-- Phase 9: Customer-facing portal — phone+OTP login, purchase-history/
-- receipt/loyalty viewing, and refill requests.

-- ---------------------------------------------------------------------------
-- tenants: portal URL slug
-- ---------------------------------------------------------------------------
-- "tenants" itself is RLS-protected (see 20260814000000_add_row_level_
-- security) and the migration runner connects as the app's own DATABASE_URL
-- role, not a superuser — without the bypass flag, the backfill UPDATE
-- below would silently match zero rows under RLS and the subsequent
-- SET NOT NULL would fail on the still-NULL existing rows.
SELECT set_config('app.rls_bypass', 'true', false);

ALTER TABLE "tenants" ADD COLUMN "portalSlug" TEXT;
-- Backfill existing tenants with their own id as a (guaranteed-unique,
-- if unglamorous) slug so every tenant has a working portal URL
-- immediately; an owner can pick a friendlier one in Settings > Branding.
UPDATE "tenants" SET "portalSlug" = "id" WHERE "portalSlug" IS NULL;
ALTER TABLE "tenants" ALTER COLUMN "portalSlug" SET NOT NULL;
CREATE UNIQUE INDEX "tenants_portalSlug_key" ON "tenants"("portalSlug");

-- ---------------------------------------------------------------------------
-- customer_otps
-- ---------------------------------------------------------------------------
CREATE TABLE "customer_otps" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_otps_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "customer_otps_tenantId_idx" ON "customer_otps"("tenantId");
CREATE INDEX "customer_otps_customerId_createdAt_idx" ON "customer_otps"("customerId", "createdAt");
ALTER TABLE "customer_otps" ADD CONSTRAINT "customer_otps_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_otps" ADD CONSTRAINT "customer_otps_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- refill_requests
-- ---------------------------------------------------------------------------
CREATE TYPE "RefillRequestStatus" AS ENUM ('pending', 'fulfilled', 'dismissed');

CREATE TABLE "refill_requests" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "note" TEXT,
    "status" "RefillRequestStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fulfilledAt" TIMESTAMP(3),

    CONSTRAINT "refill_requests_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "refill_requests_tenantId_idx" ON "refill_requests"("tenantId");
CREATE INDEX "refill_requests_customerId_idx" ON "refill_requests"("customerId");
ALTER TABLE "refill_requests" ADD CONSTRAINT "refill_requests_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "refill_requests" ADD CONSTRAINT "refill_requests_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "refill_requests" ADD CONSTRAINT "refill_requests_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "sales_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE "customer_otps" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customer_otps" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "customer_otps"
  USING ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.rls_bypass', true) = 'true')
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.rls_bypass', true) = 'true');

ALTER TABLE "refill_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "refill_requests" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "refill_requests"
  USING ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.rls_bypass', true) = 'true')
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.rls_bypass', true) = 'true');
