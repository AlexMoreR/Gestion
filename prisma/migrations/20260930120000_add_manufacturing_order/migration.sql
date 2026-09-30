-- CreateTable
CREATE TABLE "ManufacturingOrder" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "shareToken" TEXT NOT NULL,
    "deliveryDate" TIMESTAMP(3),
    "deliveryAddress" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManufacturingOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ManufacturingOrder_code_key" ON "ManufacturingOrder"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ManufacturingOrder_shareToken_key" ON "ManufacturingOrder"("shareToken");

-- CreateIndex
CREATE INDEX "ManufacturingOrder_supplierId_idx" ON "ManufacturingOrder"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "ManufacturingOrder_orderId_supplierId_key" ON "ManufacturingOrder"("orderId", "supplierId");

-- AddForeignKey
ALTER TABLE "ManufacturingOrder" ADD CONSTRAINT "ManufacturingOrder_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingOrder" ADD CONSTRAINT "ManufacturingOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
