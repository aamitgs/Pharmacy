-- Phase 7: Hospital Mode (tenant-level toggle via tenants.tenantType).
-- Adds ward/sub-store stock hierarchy, indent-based issuing, patient-
-- admission-tagged IPD dispensing, and the two new staff roles that operate
-- them. Every new table follows the exact RLS pattern established in
-- prisma/migrations/20260814000000_add_row_level_security.

-- ---------------------------------------------------------------------------
-- New roles
-- ---------------------------------------------------------------------------
ALTER TYPE "UserRole" ADD VALUE 'ward_nurse';
ALTER TYPE "UserRole" ADD VALUE 'ward_pharmacist';

-- ---------------------------------------------------------------------------
-- New enums
-- ---------------------------------------------------------------------------
CREATE TYPE "WardType" AS ENUM ('icu', 'ot', 'general', 'pharmacy_substore');
CREATE TYPE "IndentStatus" AS ENUM ('pending', 'approved', 'partially_issued', 'issued', 'rejected');

-- ---------------------------------------------------------------------------
-- wards
-- ---------------------------------------------------------------------------
CREATE TABLE "wards" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "WardType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wards_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "wards_tenantId_idx" ON "wards"("tenantId");
CREATE INDEX "wards_branchId_idx" ON "wards"("branchId");
ALTER TABLE "wards" ADD CONSTRAINT "wards_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wards" ADD CONSTRAINT "wards_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- batches.wardId — ward-scoped stock, one level deeper than branchId
-- ---------------------------------------------------------------------------
ALTER TABLE "batches" ADD COLUMN "wardId" TEXT;
CREATE INDEX "batches_wardId_idx" ON "batches"("wardId");
CREATE INDEX "batches_wardId_itemId_batchNo_idx" ON "batches"("wardId", "itemId", "batchNo");
ALTER TABLE "batches" ADD CONSTRAINT "batches_wardId_fkey" FOREIGN KEY ("wardId") REFERENCES "wards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- ward_assignments
-- ---------------------------------------------------------------------------
CREATE TABLE "ward_assignments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "wardId" TEXT NOT NULL,

    CONSTRAINT "ward_assignments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ward_assignments_userId_wardId_key" ON "ward_assignments"("userId", "wardId");
CREATE INDEX "ward_assignments_tenantId_idx" ON "ward_assignments"("tenantId");
CREATE INDEX "ward_assignments_userId_idx" ON "ward_assignments"("userId");
CREATE INDEX "ward_assignments_wardId_idx" ON "ward_assignments"("wardId");
ALTER TABLE "ward_assignments" ADD CONSTRAINT "ward_assignments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ward_assignments" ADD CONSTRAINT "ward_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ward_assignments" ADD CONSTRAINT "ward_assignments_wardId_fkey" FOREIGN KEY ("wardId") REFERENCES "wards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- indents / indent_items
-- ---------------------------------------------------------------------------
CREATE TABLE "indents" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "wardId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "status" "IndentStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "indents_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "indents_tenantId_idx" ON "indents"("tenantId");
CREATE INDEX "indents_tenantId_status_idx" ON "indents"("tenantId", "status");
CREATE INDEX "indents_wardId_idx" ON "indents"("wardId");
ALTER TABLE "indents" ADD CONSTRAINT "indents_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "indents" ADD CONSTRAINT "indents_wardId_fkey" FOREIGN KEY ("wardId") REFERENCES "wards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "indents" ADD CONSTRAINT "indents_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "indents" ADD CONSTRAINT "indents_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "indent_items" (
    "id" TEXT NOT NULL,
    "indentId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "batchId" TEXT,
    "qtyRequested" INTEGER NOT NULL,
    "qtyIssued" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "indent_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "indent_items_indentId_idx" ON "indent_items"("indentId");
CREATE INDEX "indent_items_itemId_idx" ON "indent_items"("itemId");
ALTER TABLE "indent_items" ADD CONSTRAINT "indent_items_indentId_fkey" FOREIGN KEY ("indentId") REFERENCES "indents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "indent_items" ADD CONSTRAINT "indent_items_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "indent_items" ADD CONSTRAINT "indent_items_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- patient_admissions / ipd_dispenses
-- ---------------------------------------------------------------------------
CREATE TABLE "patient_admissions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "admissionRef" TEXT NOT NULL,
    "patientName" TEXT NOT NULL,
    "wardId" TEXT NOT NULL,
    "admittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dischargedAt" TIMESTAMP(3),

    CONSTRAINT "patient_admissions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "patient_admissions_tenantId_admissionRef_key" ON "patient_admissions"("tenantId", "admissionRef");
CREATE INDEX "patient_admissions_tenantId_idx" ON "patient_admissions"("tenantId");
CREATE INDEX "patient_admissions_wardId_idx" ON "patient_admissions"("wardId");
ALTER TABLE "patient_admissions" ADD CONSTRAINT "patient_admissions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "patient_admissions" ADD CONSTRAINT "patient_admissions_wardId_fkey" FOREIGN KEY ("wardId") REFERENCES "wards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ipd_dispenses" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "admissionId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "dispensedByUserId" TEXT NOT NULL,
    "dispensedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returnedQty" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ipd_dispenses_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ipd_dispenses_tenantId_idx" ON "ipd_dispenses"("tenantId");
CREATE INDEX "ipd_dispenses_admissionId_idx" ON "ipd_dispenses"("admissionId");
ALTER TABLE "ipd_dispenses" ADD CONSTRAINT "ipd_dispenses_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ipd_dispenses" ADD CONSTRAINT "ipd_dispenses_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "patient_admissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ipd_dispenses" ADD CONSTRAINT "ipd_dispenses_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ipd_dispenses" ADD CONSTRAINT "ipd_dispenses_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ipd_dispenses" ADD CONSTRAINT "ipd_dispenses_dispensedByUserId_fkey" FOREIGN KEY ("dispensedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Row-Level Security — direct tenantId tables
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'wards', 'ward_assignments', 'indents', 'patient_admissions', 'ipd_dispenses'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING ("tenantId" = current_setting(''app.current_tenant_id'', true) OR current_setting(''app.rls_bypass'', true) = ''true'') WITH CHECK ("tenantId" = current_setting(''app.current_tenant_id'', true) OR current_setting(''app.rls_bypass'', true) = ''true'')',
      t
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Row-Level Security — indent_items (no direct tenantId, scoped via indents)
-- ---------------------------------------------------------------------------
CREATE POLICY tenant_isolation ON "indent_items"
  USING (EXISTS (SELECT 1 FROM "indents" WHERE "indents"."id" = "indent_items"."indentId" AND ("indents"."tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.rls_bypass', true) = 'true')))
  WITH CHECK (EXISTS (SELECT 1 FROM "indents" WHERE "indents"."id" = "indent_items"."indentId" AND ("indents"."tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.rls_bypass', true) = 'true')));
ALTER TABLE "indent_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "indent_items" FORCE ROW LEVEL SECURITY;
