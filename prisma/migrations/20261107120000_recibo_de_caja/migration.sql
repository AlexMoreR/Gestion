-- Recibo de caja al CRM (nov-2026): estado del envio del recibo de cada abono. Solo aditiva.
BEGIN;
ALTER TABLE "SalePayment" ADD COLUMN IF NOT EXISTS "reciboCajaEstado" TEXT;
ALTER TABLE "SalePayment" ADD COLUMN IF NOT EXISTS "reciboCajaEn" TIMESTAMP(3);
COMMIT;
