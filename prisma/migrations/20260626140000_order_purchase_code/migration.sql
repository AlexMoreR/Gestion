-- Liga la orden de compra con su grupo de movimientos de inventario (COM-...).
ALTER TABLE "Order" ADD COLUMN "purchaseCode" TEXT;

CREATE INDEX "Order_purchaseCode_idx" ON "Order"("purchaseCode");
