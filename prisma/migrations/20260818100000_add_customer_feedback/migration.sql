-- Phase 9: Customer feedback capture — post-sale WhatsApp feedback link
-- (1-5 rating + comment) and an owner-facing report.

-- ---------------------------------------------------------------------------
-- tenants: feedback-requests kill switch
-- ---------------------------------------------------------------------------
ALTER TABLE "tenants" ADD COLUMN "feedbackRequestsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- New WhatsAppMessageType value
-- ---------------------------------------------------------------------------
ALTER TYPE "WhatsAppMessageType" ADD VALUE 'feedback';

-- ---------------------------------------------------------------------------
-- customer_feedback
-- ---------------------------------------------------------------------------
CREATE TABLE "customer_feedback" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "customerId" TEXT,
    "token" TEXT NOT NULL,
    "rating" INTEGER,
    "comment" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),

    CONSTRAINT "customer_feedback_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "customer_feedback_invoiceId_key" ON "customer_feedback"("invoiceId");
CREATE UNIQUE INDEX "customer_feedback_token_key" ON "customer_feedback"("token");
CREATE INDEX "customer_feedback_tenantId_idx" ON "customer_feedback"("tenantId");
CREATE INDEX "customer_feedback_tenantId_branchId_submittedAt_idx" ON "customer_feedback"("tenantId", "branchId", "submittedAt");
ALTER TABLE "customer_feedback" ADD CONSTRAINT "customer_feedback_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_feedback" ADD CONSTRAINT "customer_feedback_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_feedback" ADD CONSTRAINT "customer_feedback_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "sales_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_feedback" ADD CONSTRAINT "customer_feedback_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE "customer_feedback" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customer_feedback" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "customer_feedback"
  USING ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.rls_bypass', true) = 'true')
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.rls_bypass', true) = 'true');
