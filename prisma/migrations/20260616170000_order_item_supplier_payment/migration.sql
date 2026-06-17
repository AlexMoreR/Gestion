-- AlterTable: OrderItem supplier payment fields
ALTER TABLE "OrderItem"
ADD COLUMN "supplierPaymentStatus" TEXT,
ADD COLUMN "supplierReceiptUrl" TEXT,
ADD COLUMN "supplierReceiptName" TEXT;

-- AlterTable: SupplierLedgerEntry per-item + receipt fields
ALTER TABLE "SupplierLedgerEntry"
ADD COLUMN "orderItemId" TEXT,
ADD COLUMN "receiptUrl" TEXT,
ADD COLUMN "receiptName" TEXT;

-- CreateIndex
CREATE INDEX "SupplierLedgerEntry_orderItemId_idx" ON "SupplierLedgerEntry"("orderItemId");

-- AddForeignKey
ALTER TABLE "SupplierLedgerEntry"
ADD CONSTRAINT "SupplierLedgerEntry_orderItemId_fkey"
FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
