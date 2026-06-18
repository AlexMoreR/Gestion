-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('CASH', 'BANK', 'WALLET', 'OTHER');

-- CreateEnum
CREATE TYPE "AccountMovementType" AS ENUM ('IN', 'OUT', 'TRANSFER');

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL DEFAULT 'CASH',
    "reference" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "openingBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountMovement" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "type" "AccountMovementType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "note" TEXT,
    "transferId" TEXT,
    "movementDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_name_key" ON "Account"("name");

-- CreateIndex
CREATE INDEX "Account_isActive_idx" ON "Account"("isActive");

-- CreateIndex
CREATE INDEX "AccountMovement_accountId_movementDate_idx" ON "AccountMovement"("accountId", "movementDate");

-- CreateIndex
CREATE INDEX "AccountMovement_transferId_idx" ON "AccountMovement"("transferId");

-- AlterTable
ALTER TABLE "SalePayment" ADD COLUMN "accountId" TEXT;

-- AlterTable
ALTER TABLE "SupplierLedgerEntry" ADD COLUMN "accountId" TEXT;

-- AlterTable
ALTER TABLE "ShippingCost" ADD COLUMN "accountId" TEXT;

-- CreateIndex
CREATE INDEX "SalePayment_accountId_idx" ON "SalePayment"("accountId");

-- CreateIndex
CREATE INDEX "SupplierLedgerEntry_accountId_idx" ON "SupplierLedgerEntry"("accountId");

-- CreateIndex
CREATE INDEX "ShippingCost_accountId_idx" ON "ShippingCost"("accountId");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountMovement" ADD CONSTRAINT "AccountMovement_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountMovement" ADD CONSTRAINT "AccountMovement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalePayment" ADD CONSTRAINT "SalePayment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierLedgerEntry" ADD CONSTRAINT "SupplierLedgerEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShippingCost" ADD CONSTRAINT "ShippingCost_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
