-- Phase 9: Franchise/dealer management — links independent tenants
-- without merging their data (see the model doc comments in schema.prisma
-- and src/lib/actions/franchise.ts for the full design rationale).

CREATE TABLE "franchise_groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "joinCode" TEXT NOT NULL,
    "ownerTenantId" TEXT NOT NULL,
    "itemListPushedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "franchise_groups_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "franchise_groups_joinCode_key" ON "franchise_groups"("joinCode");
CREATE UNIQUE INDEX "franchise_groups_ownerTenantId_key" ON "franchise_groups"("ownerTenantId");
ALTER TABLE "franchise_groups" ADD CONSTRAINT "franchise_groups_ownerTenantId_fkey" FOREIGN KEY ("ownerTenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "franchise_members" (
    "id" TEXT NOT NULL,
    "franchiseGroupId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    -- Denormalized copy of franchise_groups.ownerTenantId — required to
    -- avoid a mutually-recursive RLS policy between these two tables (see
    -- the RLS section below and the FranchiseMember model comment in
    -- schema.prisma for why).
    "ownerTenantId" TEXT NOT NULL,
    "rollupOptIn" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "franchise_members_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "franchise_members_tenantId_key" ON "franchise_members"("tenantId");
CREATE INDEX "franchise_members_franchiseGroupId_idx" ON "franchise_members"("franchiseGroupId");
CREATE INDEX "franchise_members_ownerTenantId_idx" ON "franchise_members"("ownerTenantId");
ALTER TABLE "franchise_members" ADD CONSTRAINT "franchise_members_franchiseGroupId_fkey" FOREIGN KEY ("franchiseGroupId") REFERENCES "franchise_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "franchise_members" ADD CONSTRAINT "franchise_members_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "franchise_members" ADD CONSTRAINT "franchise_members_ownerTenantId_fkey" FOREIGN KEY ("ownerTenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------
-- These two tables are the one deliberate exception to every other
-- migration's simple "tenantId = current_tenant_id" policy: a franchise
-- relationship spans two tenants by nature (the owning/franchisor tenant
-- and each member tenant). A first attempt made franchise_groups' policy
-- reference franchise_members (to grant members read access to the
-- group) AND franchise_members' policy reference franchise_groups (to
-- grant the owner read access to its members) — Postgres detects that
-- mutual reference as infinite recursion (42P17) the instant either
-- policy runs. The fix: franchise_members carries its own denormalized
-- "ownerTenantId" column (set once at join time), so its policy never
-- has to look at franchise_groups at all. Only franchise_groups' policy
-- still references the other table, and since franchise_members' policy
-- no longer references anything back, the cycle is broken.

ALTER TABLE "franchise_groups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "franchise_groups" FORCE ROW LEVEL SECURITY;
-- Readable by the owning (franchisor) tenant and by any of its members —
-- a member needs to see basic group info (name) even though it can't
-- write to the group itself. Writable only by the owning tenant (WITH
-- CHECK is deliberately narrower than USING): a member joining creates
-- its own franchise_members row, never a franchise_groups row.
CREATE POLICY tenant_isolation ON "franchise_groups"
  USING (
    "ownerTenantId" = current_setting('app.current_tenant_id', true)
    OR EXISTS (
      SELECT 1 FROM "franchise_members" fm
      WHERE fm."franchiseGroupId" = "franchise_groups"."id"
        AND fm."tenantId" = current_setting('app.current_tenant_id', true)
    )
    OR current_setting('app.rls_bypass', true) = 'true'
  )
  WITH CHECK (
    "ownerTenantId" = current_setting('app.current_tenant_id', true)
    OR current_setting('app.rls_bypass', true) = 'true'
  );

ALTER TABLE "franchise_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "franchise_members" FORCE ROW LEVEL SECURITY;
-- Readable by the member tenant itself (its own row) and by the
-- franchisor that owns its group (to list/manage all members) — using
-- the denormalized ownerTenantId column directly, no subquery into
-- franchise_groups (that's what avoids the recursion). Writable only by
-- the member tenant itself (WITH CHECK): joining, toggling its own
-- rollupOptIn, or leaving are all self-service. The franchisor can still
-- DELETE a member's row (remove them from the group) since DELETE is
-- governed by USING, not WITH CHECK — but can never directly edit a
-- member's opt-in flag or any other field on another tenant's row.
CREATE POLICY tenant_isolation ON "franchise_members"
  USING (
    "tenantId" = current_setting('app.current_tenant_id', true)
    OR "ownerTenantId" = current_setting('app.current_tenant_id', true)
    OR current_setting('app.rls_bypass', true) = 'true'
  )
  WITH CHECK (
    "tenantId" = current_setting('app.current_tenant_id', true)
    OR current_setting('app.rls_bypass', true) = 'true'
  );
