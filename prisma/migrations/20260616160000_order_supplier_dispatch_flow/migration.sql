-- CreateEnum
CREATE TYPE "SupplierLedgerType" AS ENUM ('CHARGE', 'PAYMENT');

-- AlterTable: OrderItem confirmation fields
ALTER TABLE "OrderItem"
ADD COLUMN "confirmedSupplierId" TEXT,
ADD COLUMN "purchaseCost" DECIMAL(12,2),
ADD COLUMN "confirmedAt" TIMESTAMP(3);

-- CreateTable: OrderItemPhoto
CREATE TABLE "OrderItemPhoto" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderItemPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable: SupplierLedgerEntry
CREATE TABLE "SupplierLedgerEntry" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "type" "SupplierLedgerType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "orderId" TEXT,
    "dispatchId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderItem_confirmedSupplierId_idx" ON "OrderItem"("confirmedSupplierId");
CREATE INDEX "OrderItemPhoto_orderItemId_idx" ON "OrderItemPhoto"("orderItemId");
CREATE INDEX "SupplierLedgerEntry_supplierId_createdAt_idx" ON "SupplierLedgerEntry"("supplierId", "createdAt");
CREATE INDEX "SupplierLedgerEntry_orderId_idx" ON "SupplierLedgerEntry"("orderId");
CREATE INDEX "SupplierLedgerEntry_dispatchId_idx" ON "SupplierLedgerEntry"("dispatchId");

-- AddForeignKey
ALTER TABLE "OrderItem"
ADD CONSTRAINT "OrderItem_confirmedSupplierId_fkey"
FOREIGN KEY ("confirmedSupplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OrderItemPhoto"
ADD CONSTRAINT "OrderItemPhoto_orderItemId_fkey"
FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupplierLedgerEntry"
ADD CONSTRAINT "SupplierLedgerEntry_supplierId_fkey"
FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupplierLedgerEntry"
ADD CONSTRAINT "SupplierLedgerEntry_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SupplierLedgerEntry"
ADD CONSTRAINT "SupplierLedgerEntry_dispatchId_fkey"
FOREIGN KEY ("dispatchId") REFERENCES "Dispatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SupplierLedgerEntry"
ADD CONSTRAINT "SupplierLedgerEntry_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
