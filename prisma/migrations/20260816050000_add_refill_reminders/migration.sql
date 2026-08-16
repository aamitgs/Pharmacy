-- Phase 8: Refill reminders via WhatsApp — tenant-level toggle, per-customer
-- opt-in, and a log/dedupe table for detected repeat-purchase cycles.

-- ---------------------------------------------------------------------------
-- tenants: kill switch
-- ---------------------------------------------------------------------------
ALTER TABLE "tenants" ADD COLUMN "refillRemindersEnabled" BOOLEAN NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- customers: per-customer opt-in
-- ---------------------------------------------------------------------------
ALTER TABLE "customers" ADD COLUMN "refillRemindersOptIn" BOOLEAN NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- refill_reminders
-- ---------------------------------------------------------------------------
CREATE TABLE "refill_reminders" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "lastPurchaseDate" TIMESTAMP(3) NOT NULL,
    "expectedDate" TIMESTAMP(3) NOT NULL,
    "status" "WhatsAppStatus" NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refill_reminders_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "refill_reminders_customerId_itemId_lastPurchaseDate_key" ON "refill_reminders"("customerId", "itemId", "lastPurchaseDate");
CREATE INDEX "refill_reminders_tenantId_idx" ON "refill_reminders"("tenantId");
CREATE INDEX "refill_reminders_customerId_idx" ON "refill_reminders"("customerId");
ALTER TABLE "refill_reminders" ADD CONSTRAINT "refill_reminders_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "refill_reminders" ADD CONSTRAINT "refill_reminders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "refill_reminders" ADD CONSTRAINT "refill_reminders_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE "refill_reminders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "refill_reminders" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "refill_reminders"
  USING ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.rls_bypass', true) = 'true')
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.rls_bypass', true) = 'true');
