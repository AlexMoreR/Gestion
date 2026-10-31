-- Piezas alternas en combos (31-oct-2026). Solo aditiva: una tabla nueva, sus indices y llaves,
-- y una fila de dato. No cambia ni borra datos existentes.
-- Una pieza de combo (ProductComponent) puede tener alternas (ej. butaco BMV016 o BMV003): el
-- stock de esa pieza suma la principal y sus alternas, y al vender por stock sale la que alcance.
BEGIN;

CREATE TABLE IF NOT EXISTS "ProductComponentAlternate" (
    "id" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductComponentAlternate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProductComponentAlternate_componentId_productId_key"
    ON "ProductComponentAlternate"("componentId", "productId");
CREATE INDEX IF NOT EXISTS "ProductComponentAlternate_productId_idx"
    ON "ProductComponentAlternate"("productId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductComponentAlternate_componentId_fkey') THEN
    ALTER TABLE "ProductComponentAlternate" ADD CONSTRAINT "ProductComponentAlternate_componentId_fkey"
      FOREIGN KEY ("componentId") REFERENCES "ProductComponent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductComponentAlternate_productId_fkey') THEN
    ALTER TABLE "ProductComponentAlternate" ADD CONSTRAINT "ProductComponentAlternate_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- Dato: BMV003 (NEUT CUADRADO) como alterna del butaco BMV016 en el combo CMB005. Si alguno de
-- los tres codigos no existe, no inserta nada. El id es determinista para no duplicar.
INSERT INTO "ProductComponentAlternate" ("id", "componentId", "productId", "sortOrder", "createdAt")
SELECT 'alt-' || pc."id" || '-' || alt."id", pc."id", alt."id", 0, CURRENT_TIMESTAMP
FROM "ProductComponent" pc
JOIN "Product" combo ON combo."id" = pc."parentId" AND combo."code" = 'CMB005'
JOIN "Product" principal ON principal."id" = pc."childId" AND principal."code" = 'BMV016'
JOIN "Product" alt ON alt."code" = 'BMV003'
WHERE NOT EXISTS (
    SELECT 1 FROM "ProductComponentAlternate" pca
    WHERE pca."componentId" = pc."id" AND pca."productId" = alt."id"
);

COMMIT;
