-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN "shareToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_shareToken_key" ON "Supplier"("shareToken");
