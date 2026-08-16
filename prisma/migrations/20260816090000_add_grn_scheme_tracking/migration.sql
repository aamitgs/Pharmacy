-- Phase 8: GRN manufacturer/distributor scheme tracking — bonus free
-- quantity and cash-discount % negotiated per GRN line, plus a free-text
-- scheme note. No new table (extends the existing indirect-RLS GrnItem,
-- scoped via its parent Grn's tenantId), so no RLS policy changes needed.

ALTER TABLE "grn_items" ADD COLUMN "freeQty" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "grn_items" ADD COLUMN "schemeDiscountPercent" DECIMAL(5,2);
ALTER TABLE "grn_items" ADD COLUMN "schemeNote" TEXT;
