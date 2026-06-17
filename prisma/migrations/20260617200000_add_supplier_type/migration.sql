-- CreateEnum
CREATE TYPE "SupplierType" AS ENUM ('MANUFACTURER', 'SHIPPING');

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN "type" "SupplierType" NOT NULL DEFAULT 'MANUFACTURER';
