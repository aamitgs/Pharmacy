-- CreateEnum
CREATE TYPE "RefundMode" AS ENUM ('cash', 'upi', 'card', 'ledger_adjustment');

-- AlterEnum
ALTER TYPE "CustomerLedgerEntryType" ADD VALUE 'credit_note';

-- CreateTable
CREATE TABLE "credit_notes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "creditNoteNo" TEXT NOT NULL,
    "creditNoteDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT NOT NULL,
    "restocked" BOOLEAN NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "taxAmount" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "refundMode" "RefundMode" NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_note_items" (
    "id" TEXT NOT NULL,
    "creditNoteId" TEXT NOT NULL,
    "invoiceItemId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "rate" DECIMAL(10,2) NOT NULL,
    "taxRate" DECIMAL(5,2) NOT NULL,
    "discountAmount" DECIMAL(10,2) NOT NULL,
    "taxableValue" DECIMAL(12,2) NOT NULL,
    "taxAmount" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "credit_note_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "credit_notes_tenantId_idx" ON "credit_notes"("tenantId");

-- CreateIndex
CREATE INDEX "credit_notes_tenantId_creditNoteDate_idx" ON "credit_notes"("tenantId", "creditNoteDate");

-- CreateIndex
CREATE INDEX "credit_notes_invoiceId_idx" ON "credit_notes"("invoiceId");

-- CreateIndex
CREATE INDEX "credit_notes_branchId_idx" ON "credit_notes"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "credit_notes_tenantId_creditNoteNo_key" ON "credit_notes"("tenantId", "creditNoteNo");

-- CreateIndex
CREATE INDEX "credit_note_items_creditNoteId_idx" ON "credit_note_items"("creditNoteId");

-- CreateIndex
CREATE INDEX "credit_note_items_invoiceItemId_idx" ON "credit_note_items"("invoiceItemId");

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "sales_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note_items" ADD CONSTRAINT "credit_note_items_creditNoteId_fkey" FOREIGN KEY ("creditNoteId") REFERENCES "credit_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note_items" ADD CONSTRAINT "credit_note_items_invoiceItemId_fkey" FOREIGN KEY ("invoiceItemId") REFERENCES "sales_invoice_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note_items" ADD CONSTRAINT "credit_note_items_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note_items" ADD CONSTRAINT "credit_note_items_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Row-Level Security
--
-- credit_notes carries its own tenantId and gets the standard policy.
-- credit_note_items has no tenantId of its own, so it is policed through its
-- parent — the same shape sales_invoice_items and purchase_return_items use.
-- Without this the line table would be readable across tenants even though
-- its parent is not, which is exactly the hole RLS exists to close.
-- ---------------------------------------------------------------------------
ALTER TABLE "credit_notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "credit_notes" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "credit_notes"
  USING ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.rls_bypass', true) = 'true')
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.rls_bypass', true) = 'true');

ALTER TABLE "credit_note_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "credit_note_items" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "credit_note_items"
  USING (EXISTS (
    SELECT 1 FROM "credit_notes" cn
    WHERE cn.id = "credit_note_items"."creditNoteId"
      AND (cn."tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.rls_bypass', true) = 'true')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "credit_notes" cn
    WHERE cn.id = "credit_note_items"."creditNoteId"
      AND (cn."tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.rls_bypass', true) = 'true')
  ));
