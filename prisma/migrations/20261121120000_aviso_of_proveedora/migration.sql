-- Aviso de la OF a la proveedora por WhatsApp (nov-2026, combo camilla parte 3). Solo aditiva.
-- avisoProveedoraEstado: ENVIANDO (candado) / ENVIADO / PRUEBA / ALERTA / FALLIDO; NULL = nunca se mandó.
BEGIN;
ALTER TABLE "ManufacturingOrder" ADD COLUMN IF NOT EXISTS "avisoProveedoraEstado" TEXT;
ALTER TABLE "ManufacturingOrder" ADD COLUMN IF NOT EXISTS "avisoProveedoraEn" TIMESTAMP(3);
ALTER TABLE "ManufacturingOrder" ADD COLUMN IF NOT EXISTS "avisoProveedoraDestino" TEXT;
COMMIT;
