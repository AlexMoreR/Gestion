-- AlterTable: Dispatch carrier + shipping cost + receipt
ALTER TABLE "Dispatch"
ADD COLUMN "carrierSupplierId" TEXT,
ADD COLUMN "shippingCost" DECIMAL(12,2),
ADD COLUMN "shippingReceiptUrl" TEXT,
ADD COLUMN "shippingReceiptName" TEXT;

-- CreateIndex
CREATE INDEX "Dispatch_carrierSupplierId_idx" ON "Dispatch"("carrierSupplierId");

-- AddForeignKey
ALTER TABLE "Dispatch"
ADD CONSTRAINT "Dispatch_carrierSupplierId_fkey"
FOREIGN KEY ("carrierSupplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
