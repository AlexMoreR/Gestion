-- Flete pagado al despachar (30-oct-2026). Solo aditiva: dos columnas opcionales, sus indices
-- y sus llaves foraneas. No cambia datos existentes.
-- ShippingCost.supplierPaymentId: pago al transportador que cubre ese flete (el pago es el que
-- resta del saldo de la cuenta). DispatchShippingLeg.supplierPaymentId: pago de ese tramo.
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
