-- Piezas alternas en combos (31-oct-2026). Solo aditiva: una tabla nueva, sus indices, sus
-- llaves foraneas y una fila de dato (BMV003 como alterna de BMV016 en el combo CMB005).
-- El stock de cada pieza del combo = principal + alternas; al vender por stock sale la que hay.
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

-- Dato: BMV003 (NEUT CUADRADO) como alterna del butaco BMV016 en CMB005. Si algun codigo no
-- existe, no agrega nada.
INSERT INTO "ProductComponentAlternate" ("id", "componentId", "productId", "sortOrder")
SELECT 'alt_' || md5(pc."id" || alt."id"), pc."id", alt."id", 0
FROM "ProductComponent" pc
JOIN "Product" combo ON combo."id" = pc."parentId" AND combo."code" = 'CMB005'
JOIN "Product" principal ON principal."id" = pc."childId" AND principal."code" = 'BMV016'
JOIN "Product" alt ON alt."code" = 'BMV003'
WHERE NOT EXISTS (
  SELECT 1 FROM "ProductComponentAlternate" pca
  WHERE pca."componentId" = pc."id" AND pca."productId" = alt."id"
);

COMMIT;
