-- CreateTable
CREATE TABLE "gst_filing_reminders" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "leadDays" INTEGER NOT NULL DEFAULT 7,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gst_filing_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gst_filing_reminders_tenantId_idx" ON "gst_filing_reminders"("tenantId");

-- AddForeignKey
ALTER TABLE "gst_filing_reminders" ADD CONSTRAINT "gst_filing_reminders_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-Level Security: same direct-tenantId policy shape as every other
-- tenant-scoped table.
ALTER TABLE "gst_filing_reminders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gst_filing_reminders" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "gst_filing_reminders"
  USING ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.rls_bypass', true) = 'true')
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.rls_bypass', true) = 'true');
