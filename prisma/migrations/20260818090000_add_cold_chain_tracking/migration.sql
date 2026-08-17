-- Phase 9: Cold-chain temperature tracking — Item.requiresColdChain flag
-- plus manual per-branch TemperatureLog readings.

ALTER TABLE "items" ADD COLUMN "requiresColdChain" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "temperature_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "temperatureCelsius" DECIMAL(5,2) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedByUserId" TEXT NOT NULL,
    "note" TEXT,

    CONSTRAINT "temperature_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "temperature_logs_tenantId_idx" ON "temperature_logs"("tenantId");
CREATE INDEX "temperature_logs_branchId_recordedAt_idx" ON "temperature_logs"("branchId", "recordedAt");
ALTER TABLE "temperature_logs" ADD CONSTRAINT "temperature_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "temperature_logs" ADD CONSTRAINT "temperature_logs_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "temperature_logs" ADD CONSTRAINT "temperature_logs_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE "temperature_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "temperature_logs" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "temperature_logs"
  USING ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.rls_bypass', true) = 'true')
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.rls_bypass', true) = 'true');
