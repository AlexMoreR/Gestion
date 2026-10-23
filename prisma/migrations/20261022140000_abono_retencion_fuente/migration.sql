-- Abono por retencion en la fuente: lo que una empresa cliente se queda y paga a la DIAN a
-- nombre de Magilus. Cuenta como pagado en la venta, pero no entra a ninguna cuenta de dinero.
-- Migracion SOLO ADITIVA: agrega dos columnas y un indice a "SalePayment"; no cambia ni borra
-- nada. Los abonos que ya existen quedan con isWithholding = false (no es retencion).

BEGIN;

ALTER TABLE "SalePayment" ADD COLUMN IF NOT EXISTS "isWithholding" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SalePayment" ADD COLUMN IF NOT EXISTS "withholdingCertificate" TEXT;

CREATE INDEX IF NOT EXISTS "SalePayment_isWithholding_paymentDate_idx" ON "SalePayment"("isWithholding", "paymentDate");

COMMIT;
