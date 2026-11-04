-- Partes de color por categoria y por producto (nov-2026). Solo aditiva: un enum y una tabla nueva.
BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ParteColorTipo') THEN
        CREATE TYPE "ParteColorTipo" AS ENUM ('CARTA', 'ACABADOS');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "ParteColor" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT,
    "productId" TEXT,
    "nombre" TEXT NOT NULL,
    "tipo" "ParteColorTipo" NOT NULL,
    "materiales" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "acabados" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "mascaraUrl" TEXT,
    "orden" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ParteColor_pkey" PRIMARY KEY ("id"),
    -- Exactamente uno: plantilla de categoria o partes propias del producto.
    CONSTRAINT "ParteColor_duenio_check" CHECK (("categoryId" IS NULL) <> ("productId" IS NULL))
);

CREATE INDEX IF NOT EXISTS "ParteColor_categoryId_idx" ON "ParteColor"("categoryId");
CREATE INDEX IF NOT EXISTS "ParteColor_productId_idx" ON "ParteColor"("productId");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ParteColor_categoryId_fkey') THEN
        ALTER TABLE "ParteColor" ADD CONSTRAINT "ParteColor_categoryId_fkey"
            FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ParteColor_productId_fkey') THEN
        ALTER TABLE "ParteColor" ADD CONSTRAINT "ParteColor_productId_fkey"
            FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

COMMIT;
