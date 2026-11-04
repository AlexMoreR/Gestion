-- Colores por parte, parte 4 (nov-2026). Solo aditiva: color exacto (#RRGGBB) de cada acabado.
-- Forma: { "<acabado>": "#RRGGBB" }. NULL = se usan los colores de fábrica (src/lib/product-parts.ts).
BEGIN;

ALTER TABLE "ParteColor" ADD COLUMN IF NOT EXISTS "acabadosHex" JSONB;

COMMIT;
