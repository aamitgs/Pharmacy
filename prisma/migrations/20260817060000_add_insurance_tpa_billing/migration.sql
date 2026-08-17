-- Phase 8: Insurance/TPA cashless billing — a new "insurance" payment mode
-- plus provider master data and per-invoice claim tracking.

-- ---------------------------------------------------------------------------
-- New PaymentMode value
-- ---------------------------------------------------------------------------
ALTER TYPE "PaymentMode" ADD VALUE 'insurance';

-- ---------------------------------------------------------------------------
-- insurance_providers
-- ---------------------------------------------------------------------------
CREATE TABLE "insurance_providers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tpaCode" TEXT,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "insurance_providers_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "insurance_providers_tenantId_idx" ON "insurance_providers"("tenantId");
ALTER TABLE "insurance_providers" ADD CONSTRAINT "insurance_providers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- insurance_claims
-- ---------------------------------------------------------------------------
CREATE TYPE "InsuranceClaimStatus" AS ENUM ('pending', 'approved', 'rejected', 'settled');

CREATE TABLE "insurance_claims" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "insuranceProviderId" TEXT NOT NULL,
    "claimNumber" TEXT,
    "claimedAmount" DECIMAL(12,2) NOT NULL,
    "coPayAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "InsuranceClaimStatus" NOT NULL DEFAULT 'pending',
    "settledAmount" DECIMAL(12,2),
    "settledAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insurance_claims_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "insurance_claims_invoiceId_key" ON "insurance_claims"("invoiceId");
CREATE INDEX "insurance_claims_tenantId_idx" ON "insurance_claims"("tenantId");
CREATE INDEX "insurance_claims_insuranceProviderId_idx" ON "insurance_claims"("insuranceProviderId");
ALTER TABLE "insurance_claims" ADD CONSTRAINT "insurance_claims_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "insurance_claims" ADD CONSTRAINT "insurance_claims_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "sales_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "insurance_claims" ADD CONSTRAINT "insurance_claims_insuranceProviderId_fkey" FOREIGN KEY ("insuranceProviderId") REFERENCES "insurance_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE "insurance_providers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "insurance_providers" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "insurance_providers"
  USING ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.rls_bypass', true) = 'true')
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.rls_bypass', true) = 'true');

ALTER TABLE "insurance_claims" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "insurance_claims" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "insurance_claims"
  USING ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.rls_bypass', true) = 'true')
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.rls_bypass', true) = 'true');
