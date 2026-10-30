-- Flete pagado al despachar: el costo de envio de la venta (ShippingCost) y cada tramo del despacho
-- (DispatchShippingLeg) quedan enlazados al pago al transportador (SupplierLedgerEntry PAYMENT) que
-- tiene la cuenta y el comprobante. Asi hay un solo registro que mueve plata y no se resta dos veces.
-- Migracion SOLO ADITIVA: dos columnas nuevas que pueden quedar vacias, sus indices y llaves foraneas.
-- Si se borra el pago, el flete vuelve a quedar "sin cuenta" (ON DELETE SET NULL).
BEGIN;

ALTER TABLE "ShippingCost" ADD COLUMN IF NOT EXISTS "supplierPaymentId" TEXT;
ALTER TABLE "DispatchShippingLeg" ADD COLUMN IF NOT EXISTS "supplierPaymentId" TEXT;

CREATE INDEX IF NOT EXISTS "ShippingCost_supplierPaymentId_idx" ON "ShippingCost"("supplierPaymentId");
CREATE INDEX IF NOT EXISTS "DispatchShippingLeg_supplierPaymentId_idx" ON "DispatchShippingLeg"("supplierPaymentId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ShippingCost_supplierPaymentId_fkey') THEN
    ALTER TABLE "ShippingCost" ADD CONSTRAINT "ShippingCost_supplierPaymentId_fkey"
      FOREIGN KEY ("supplierPaymentId") REFERENCES "SupplierLedgerEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DispatchShippingLeg_supplierPaymentId_fkey') THEN
    ALTER TABLE "DispatchShippingLeg" ADD CONSTRAINT "DispatchShippingLeg_supplierPaymentId_fkey"
      FOREIGN KEY ("supplierPaymentId") REFERENCES "SupplierLedgerEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

COMMIT;
