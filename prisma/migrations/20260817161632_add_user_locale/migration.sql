-- DropForeignKey
ALTER TABLE "batches" DROP CONSTRAINT "batches_wardId_fkey";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "locale" TEXT NOT NULL DEFAULT 'en';

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_wardId_fkey" FOREIGN KEY ("wardId") REFERENCES "wards"("id") ON DELETE SET NULL ON UPDATE CASCADE;
