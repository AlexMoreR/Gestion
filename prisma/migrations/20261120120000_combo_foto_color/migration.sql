-- Foto por color del combo camilla (parte 1). Solo aditiva: una tabla nueva, no toca datos ni crea enums.
BEGIN;

CREATE TABLE IF NOT EXISTS "ComboFotoColor" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "claveColor" TEXT NOT NULL,
    "etiqueta" TEXT NOT NULL,
    "fotoUrl" TEXT NOT NULL,
    "actualizadoPorId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ComboFotoColor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ComboFotoColor_productId_claveColor_key" ON "ComboFotoColor"("productId", "claveColor");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComboFotoColor_productId_fkey') THEN
        ALTER TABLE "ComboFotoColor" ADD CONSTRAINT "ComboFotoColor_productId_fkey"
            FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

COMMIT;
