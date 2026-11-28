-- Venta anulada: pasar sus productos a inventario sin deuda nueva y registrar la devolución de dinero.
-- Solo aditiva (columnas opcionales, sin llaves foráneas, como RegistroRetroactivo).
BEGIN;
-- Línea de la venta anulada de donde salió la entrada: al revender, el costo es su purchaseCost.
ALTER TABLE "InventoryMovement" ADD COLUMN IF NOT EXISTS "sourceOrderItemId" TEXT;
CREATE INDEX IF NOT EXISTS "InventoryMovement_sourceOrderItemId_idx" ON "InventoryMovement"("sourceOrderItemId");
-- Venta a la que pertenece una salida de cuenta (devolución de dinero a la clienta).
ALTER TABLE "AccountMovement" ADD COLUMN IF NOT EXISTS "saleId" TEXT;
CREATE INDEX IF NOT EXISTS "AccountMovement_saleId_idx" ON "AccountMovement"("saleId");
COMMIT;
