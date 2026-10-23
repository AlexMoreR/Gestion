-- Asistencia: registro de entrada y salida de cada trabajador.
-- La hora de cada marca la pone el servidor. Las marcas no se borran: una correccion anula
-- la original (anuladaEn/anuladaPorId/motivoAnulacion) y crea otra con origen CORRECCION.
-- Migracion SOLO ADITIVA: crea dos tipos y una tabla nueva; no cambia ni borra nada existente.

BEGIN;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AsistenciaTipo') THEN
    CREATE TYPE "AsistenciaTipo" AS ENUM ('ENTRADA', 'SALIDA');
  END IF;
END
$$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AsistenciaOrigen') THEN
    CREATE TYPE "AsistenciaOrigen" AS ENUM ('PROPIA', 'ADMIN', 'CORRECCION');
  END IF;
END
$$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "AsistenciaMarca" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tipo" "AsistenciaTipo" NOT NULL,
    "marcadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dia" DATE NOT NULL,
    "origen" "AsistenciaOrigen" NOT NULL DEFAULT 'PROPIA',
    "creadaPorId" TEXT,
    "motivo" TEXT,
    "corrigeAId" TEXT,
    "anuladaEn" TIMESTAMP(3),
    "anuladaPorId" TEXT,
    "motivoAnulacion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AsistenciaMarca_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AsistenciaMarca_userId_dia_idx" ON "AsistenciaMarca"("userId", "dia");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AsistenciaMarca_dia_idx" ON "AsistenciaMarca"("dia");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AsistenciaMarca_userId_fkey') THEN
    ALTER TABLE "AsistenciaMarca" ADD CONSTRAINT "AsistenciaMarca_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AsistenciaMarca_creadaPorId_fkey') THEN
    ALTER TABLE "AsistenciaMarca" ADD CONSTRAINT "AsistenciaMarca_creadaPorId_fkey" FOREIGN KEY ("creadaPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AsistenciaMarca_anuladaPorId_fkey') THEN
    ALTER TABLE "AsistenciaMarca" ADD CONSTRAINT "AsistenciaMarca_anuladaPorId_fkey" FOREIGN KEY ("anuladaPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

COMMIT;
