-- AlterTable: SupplierLedgerEntry payments metadata
ALTER TABLE "SupplierLedgerEntry"
ADD COLUMN "saleId" TEXT,
ADD COLUMN "transactionReference" TEXT,
ADD COLUMN "paymentDate" TIMESTAMP(3);

CREATE INDEX "SupplierLedgerEntry_saleId_createdAt_idx" ON "SupplierLedgerEntry"("saleId", "createdAt");

ALTER TABLE "SupplierLedgerEntry"
ADD CONSTRAINT "SupplierLedgerEntry_saleId_fkey"
FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: ShippingCost
CREATE TABLE "ShippingCost" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "shippingProvider" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "transactionReference" TEXT NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShippingCost_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ShippingCost_saleId_createdAt_idx" ON "ShippingCost"("saleId", "createdAt");
CREATE INDEX "ShippingCost_createdById_createdAt_idx" ON "ShippingCost"("createdById", "createdAt");

ALTER TABLE "ShippingCost"
ADD CONSTRAINT "ShippingCost_saleId_fkey"
FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ShippingCost"
ADD CONSTRAINT "ShippingCost_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
