-- Moves the discount-override PIN from the tenant to the individual manager.
--
-- `tenants.managerPinHash` is dropped rather than kept as a fallback: it was
-- a single shared secret, so an override authorised by it could never name
-- who approved. No application code ever wrote it — only prisma/seed.ts, to a
-- hardcoded demo value — so there is no configured production PIN to
-- preserve. Each owner/pharmacist now sets their own PIN in Settings, and
-- discounts.approvedByUserId finally gets a real person in it.
--
-- Effect on deploy: counter staff cannot exceed the discount cap until at
-- least one manager has set a PIN. That is intentional and fails closed.

/*
  Warnings:

  - You are about to drop the column `managerPinHash` on the `tenants` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "discounts" ADD COLUMN     "requiredOverride" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "tenants" DROP COLUMN "managerPinHash";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "overridePinHash" TEXT;
