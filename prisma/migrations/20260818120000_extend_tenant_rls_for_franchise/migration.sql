-- Phase 9: extend the tenants table's own RLS policy so a franchisor can
-- read a member tenant's basic Tenant row (pharmacyName) directly under
-- its own session, without needing a cross-tenant tenantContext override
-- for what's genuinely public-within-the-relationship info (a pharmacy's
-- display name, nothing sensitive). No recursion risk: this references
-- franchise_members (self-contained policy, no back-reference to tenants)
-- joined to franchise_groups (whose own policy only references
-- franchise_members, never tenants) — the dependency graph is one-way.
--
-- Write access (WITH CHECK) is intentionally unchanged: a franchisor can
-- read a member's name, never modify anything on the member's own Tenant
-- row.

DROP POLICY tenant_isolation ON "tenants";
CREATE POLICY tenant_isolation ON "tenants"
  USING (
    "id" = current_setting('app.current_tenant_id', true)
    OR EXISTS (
      SELECT 1 FROM "franchise_members" fm
      JOIN "franchise_groups" fg ON fg."id" = fm."franchiseGroupId"
      WHERE fm."tenantId" = "tenants"."id"
        AND fg."ownerTenantId" = current_setting('app.current_tenant_id', true)
    )
    OR current_setting('app.rls_bypass', true) = 'true'
  )
  WITH CHECK (
    "id" = current_setting('app.current_tenant_id', true)
    OR current_setting('app.rls_bypass', true) = 'true'
  );
