-- Color exacto (#RRGGBB) de cada acabado de una parte de color (solo aditiva).
BEGIN;
ALTER TABLE "ParteColor" ADD COLUMN IF NOT EXISTS "acabadosHex" JSONB;
COMMIT;
