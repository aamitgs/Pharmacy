-- Phase 9: Rate contract management — per-customer, per-item negotiated
-- pricing auto-applied at POS billing.

CREATE TABLE "rate_contracts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "contractRate" DECIMAL(10,2) NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_contracts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "rate_contracts_tenantId_idx" ON "rate_contracts"("tenantId");
CREATE INDEX "rate_contracts_tenantId_customerId_itemId_idx" ON "rate_contracts"("tenantId", "customerId", "itemId");
ALTER TABLE "rate_contracts" ADD CONSTRAINT "rate_contracts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rate_contracts" ADD CONSTRAINT "rate_contracts_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rate_contracts" ADD CONSTRAINT "rate_contracts_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE "rate_contracts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "rate_contracts" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "rate_contracts"
  USING ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.rls_bypass', true) = 'true')
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.rls_bypass', true) = 'true');
