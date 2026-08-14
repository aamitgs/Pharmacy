-- Phase 6: PostgreSQL Row-Level Security (RLS) as a second, DB-enforced layer
-- of tenant isolation, in addition to the existing application-layer
-- `WHERE tenantId = ?` filtering.
--
-- The app connects as the table-owning role ("pharmacy"), which bypasses RLS
-- by default -- FORCE ROW LEVEL SECURITY is required on every table so the
-- owner role is subject to the same policies as everyone else.
--
-- Tenant context is communicated per-query via the session variable
-- `app.current_tenant_id`, set with `set_config(..., is_local => true)` so it
-- resets at transaction end and never leaks across pooled connections.
--
-- `app.rls_bypass = 'true'` is a narrow escape hatch for a small set of
-- deliberately-written internal code paths that legitimately need to read
-- across tenants or before a tenant is known (login lookup, seed script,
-- scheduled backup, future super-admin console). No tenant-facing action
-- code may set this flag.

-- ---------------------------------------------------------------------------
-- Tenant itself: matches on id, not tenantId (Tenant IS the tenant).
-- ---------------------------------------------------------------------------
ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenants" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "tenants"
  USING ("id" = current_setting('app.current_tenant_id', true) OR current_setting('app.rls_bypass', true) = 'true')
  WITH CHECK ("id" = current_setting('app.current_tenant_id', true) OR current_setting('app.rls_bypass', true) = 'true');

-- ---------------------------------------------------------------------------
-- Tables with a direct tenantId column.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'branches', 'items', 'customers', 'whatsapp_logs', 'customer_ledger_entries',
    'schemes', 'loyalty_tiers', 'coupons', 'doctors', 'sales_invoices', 'discounts',
    'users', 'audit_logs', 'backup_logs', 'suppliers', 'purchase_orders', 'grns',
    'purchase_returns', 'supplier_ledger_entries', 'stock_transfers', 'narcotic_register_entries'
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
-- Child/line-item tables with no direct tenantId column: scoped indirectly
-- via an EXISTS subquery into their parent's tenantId.
-- ---------------------------------------------------------------------------
CREATE POLICY tenant_isolation ON "batches"
  USING (EXISTS (SELECT 1 FROM "items" WHERE "items"."id" = "batches"."itemId" AND ("items"."tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.rls_bypass', true) = 'true')))
  WITH CHECK (EXISTS (SELECT 1 FROM "items" WHERE "items"."id" = "batches"."itemId" AND ("items"."tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.rls_bypass', true) = 'true')));
ALTER TABLE "batches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "batches" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "sales_invoice_items"
  USING (EXISTS (SELECT 1 FROM "sales_invoices" WHERE "sales_invoices"."id" = "sales_invoice_items"."invoiceId" AND ("sales_invoices"."tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.rls_bypass', true) = 'true')))
  WITH CHECK (EXISTS (SELECT 1 FROM "sales_invoices" WHERE "sales_invoices"."id" = "sales_invoice_items"."invoiceId" AND ("sales_invoices"."tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.rls_bypass', true) = 'true')));
ALTER TABLE "sales_invoice_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sales_invoice_items" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "purchase_order_items"
  USING (EXISTS (SELECT 1 FROM "purchase_orders" WHERE "purchase_orders"."id" = "purchase_order_items"."purchaseOrderId" AND ("purchase_orders"."tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.rls_bypass', true) = 'true')))
  WITH CHECK (EXISTS (SELECT 1 FROM "purchase_orders" WHERE "purchase_orders"."id" = "purchase_order_items"."purchaseOrderId" AND ("purchase_orders"."tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.rls_bypass', true) = 'true')));
ALTER TABLE "purchase_order_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "purchase_order_items" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "grn_items"
  USING (EXISTS (SELECT 1 FROM "grns" WHERE "grns"."id" = "grn_items"."grnId" AND ("grns"."tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.rls_bypass', true) = 'true')))
  WITH CHECK (EXISTS (SELECT 1 FROM "grns" WHERE "grns"."id" = "grn_items"."grnId" AND ("grns"."tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.rls_bypass', true) = 'true')));
ALTER TABLE "grn_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "grn_items" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "purchase_return_items"
  USING (EXISTS (SELECT 1 FROM "purchase_returns" WHERE "purchase_returns"."id" = "purchase_return_items"."purchaseReturnId" AND ("purchase_returns"."tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.rls_bypass', true) = 'true')))
  WITH CHECK (EXISTS (SELECT 1 FROM "purchase_returns" WHERE "purchase_returns"."id" = "purchase_return_items"."purchaseReturnId" AND ("purchase_returns"."tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.rls_bypass', true) = 'true')));
ALTER TABLE "purchase_return_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "purchase_return_items" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "stock_transfer_items"
  USING (EXISTS (SELECT 1 FROM "stock_transfers" WHERE "stock_transfers"."id" = "stock_transfer_items"."transferId" AND ("stock_transfers"."tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.rls_bypass', true) = 'true')))
  WITH CHECK (EXISTS (SELECT 1 FROM "stock_transfers" WHERE "stock_transfers"."id" = "stock_transfer_items"."transferId" AND ("stock_transfers"."tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.rls_bypass', true) = 'true')));
ALTER TABLE "stock_transfer_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_transfer_items" FORCE ROW LEVEL SECURITY;
