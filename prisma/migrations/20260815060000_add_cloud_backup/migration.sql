-- Phase 8: Cloud backup (Google Drive & OneDrive) — extends the existing
-- local/manual backup mechanism with per-tenant OAuth-connected cloud
-- destinations.

-- ---------------------------------------------------------------------------
-- New BackupDestination values
-- ---------------------------------------------------------------------------
ALTER TYPE "BackupDestination" ADD VALUE 'google_drive';
ALTER TYPE "BackupDestination" ADD VALUE 'onedrive';

-- ---------------------------------------------------------------------------
-- New enum
-- ---------------------------------------------------------------------------
CREATE TYPE "CloudBackupProvider" AS ENUM ('google_drive', 'onedrive');

-- ---------------------------------------------------------------------------
-- cloud_backup_connections
-- ---------------------------------------------------------------------------
CREATE TABLE "cloud_backup_connections" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" "CloudBackupProvider" NOT NULL,
    "accessTokenEnc" TEXT NOT NULL,
    "refreshTokenEnc" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "connectedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cloud_backup_connections_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "cloud_backup_connections_tenantId_provider_key" ON "cloud_backup_connections"("tenantId", "provider");
CREATE INDEX "cloud_backup_connections_tenantId_idx" ON "cloud_backup_connections"("tenantId");
ALTER TABLE "cloud_backup_connections" ADD CONSTRAINT "cloud_backup_connections_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cloud_backup_connections" ADD CONSTRAINT "cloud_backup_connections_connectedByUserId_fkey" FOREIGN KEY ("connectedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE "cloud_backup_connections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cloud_backup_connections" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "cloud_backup_connections"
  USING ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.rls_bypass', true) = 'true')
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.rls_bypass', true) = 'true');
