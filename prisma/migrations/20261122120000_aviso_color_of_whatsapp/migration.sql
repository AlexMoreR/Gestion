-- Aviso por WhatsApp de un cambio en una OF ya enviada a la proveedora (nov-2026, combo camilla parte 4).
-- Solo aditiva. whatsappEstado: ENVIANDO (candado) / ENVIADO / PRUEBA / ALERTA / FALLIDO; NULL = no se ha mandado.
BEGIN;
ALTER TABLE "AvisoColorOF" ADD COLUMN IF NOT EXISTS "whatsappEstado" TEXT;
ALTER TABLE "AvisoColorOF" ADD COLUMN IF NOT EXISTS "whatsappEn" TIMESTAMP(3);
COMMIT;
