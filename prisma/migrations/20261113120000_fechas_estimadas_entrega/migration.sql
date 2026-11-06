-- Fechas estimadas de entrega (nov-2026). Solo aditiva: 3 columnas vacías, sin valor por defecto.
BEGIN;
ALTER TABLE "Dispatch" ADD COLUMN IF NOT EXISTS "estimatedDeliveryAt" TIMESTAMP(3);
ALTER TABLE "ManufacturingOrder" ADD COLUMN IF NOT EXISTS "estimatedDeliveryAt" TIMESTAMP(3);
ALTER TABLE "ManufacturingOrder" ADD COLUMN IF NOT EXISTS "receivedAt" TIMESTAMP(3);
COMMIT;
