-- Colores por parte, parte 2 (nov-2026). Solo aditiva: aprobación de colores en Quote y
-- recargo (solo aviso) + colores comunes en ParteColor.
BEGIN;

ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "coloresAprobadosEn" TIMESTAMP(3);
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "coloresAprobadosPorId" TEXT;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Quote_coloresAprobadosPorId_fkey') THEN
        ALTER TABLE "Quote" ADD CONSTRAINT "Quote_coloresAprobadosPorId_fkey"
            FOREIGN KEY ("coloresAprobadosPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

ALTER TABLE "ParteColor" ADD COLUMN IF NOT EXISTS "recargos" JSONB;
ALTER TABLE "ParteColor" ADD COLUMN IF NOT EXISTS "coloresComunes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

COMMIT;
