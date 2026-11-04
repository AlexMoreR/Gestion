-- Forma de pago "Pago total (100 %)" (nov-2026). Solo aditiva: un valor nuevo en el enum de forma de pago.
BEGIN;
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'PAGO_TOTAL';
COMMIT;
