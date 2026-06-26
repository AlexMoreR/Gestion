-- Agrupa los movimientos de inventario de una misma compra directa a proveedor.
ALTER TABLE "InventoryMovement" ADD COLUMN "purchaseCode" TEXT;

CREATE INDEX "InventoryMovement_purchaseCode_idx" ON "InventoryMovement"("purchaseCode");
