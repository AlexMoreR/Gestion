-- Aviso de cambio de color para la proveedora de una OF (solo aditiva).
BEGIN;
CREATE TABLE IF NOT EXISTS "AvisoColorOF" (
  "id" TEXT NOT NULL,
  "manufacturingOrderId" TEXT NOT NULL,
  "producto" TEXT NOT NULL,
  "colorViejo" TEXT NOT NULL,
  "colorNuevo" TEXT NOT NULL,
  "creadoPorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "vistoEn" TIMESTAMP(3),
  CONSTRAINT "AvisoColorOF_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AvisoColorOF_manufacturingOrderId_idx" ON "AvisoColorOF"("manufacturingOrderId");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AvisoColorOF_manufacturingOrderId_fkey') THEN
    ALTER TABLE "AvisoColorOF" ADD CONSTRAINT "AvisoColorOF_manufacturingOrderId_fkey"
      FOREIGN KEY ("manufacturingOrderId") REFERENCES "ManufacturingOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
COMMIT;
