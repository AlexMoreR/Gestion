-- Fotos del embalaje de cada producto al despacharlo con transportadora (solo aditiva).
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EmbalajeFotoTipo') THEN
    CREATE TYPE "EmbalajeFotoTipo" AS ENUM ('ABIERTO', 'CERRADO', 'EXTRA', 'LLEGADA');
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS "EmbalajeFoto" (
  "id" TEXT NOT NULL,
  "orderItemId" TEXT NOT NULL,
  "dispatchId" TEXT,
  "tipo" "EmbalajeFotoTipo" NOT NULL,
  "url" TEXT NOT NULL,
  "subidoPorUserId" TEXT,
  "subidoPorTexto" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmbalajeFoto_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "EmbalajeFoto_orderItemId_idx" ON "EmbalajeFoto"("orderItemId");
CREATE INDEX IF NOT EXISTS "EmbalajeFoto_dispatchId_idx" ON "EmbalajeFoto"("dispatchId");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EmbalajeFoto_orderItemId_fkey') THEN
    ALTER TABLE "EmbalajeFoto" ADD CONSTRAINT "EmbalajeFoto_orderItemId_fkey"
      FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EmbalajeFoto_dispatchId_fkey') THEN
    ALTER TABLE "EmbalajeFoto" ADD CONSTRAINT "EmbalajeFoto_dispatchId_fkey"
      FOREIGN KEY ("dispatchId") REFERENCES "Dispatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EmbalajeFoto_subidoPorUserId_fkey') THEN
    ALTER TABLE "EmbalajeFoto" ADD CONSTRAINT "EmbalajeFoto_subidoPorUserId_fkey"
      FOREIGN KEY ("subidoPorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
COMMIT;
