-- Equipo: ficha de cada trabajador (datos personales, cargo, forma de pago, ingreso y salida).
-- El estado Activo/Retirado no se guarda: sale de la fecha de salida.
-- Migracion SOLO ADITIVA: crea dos tipos y una tabla nueva; no cambia ni borra nada existente.
-- Los datos iniciales los carga el codigo (src/modules/equipo), no esta migracion.

BEGIN;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TeamEmploymentType') THEN
    CREATE TYPE "TeamEmploymentType" AS ENUM ('FREELANCE', 'EMPLEADO', 'OTRO');
  END IF;
END
$$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TeamPayType') THEN
    CREATE TYPE "TeamPayType" AS ENUM ('QUINCENAL', 'DIARIO', 'SOLO_COMISION');
  END IF;
END
$$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "TeamMember" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "fullName" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "document" TEXT,
    "birthDate" DATE,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "emergencyName" TEXT,
    "emergencyPhone" TEXT,
    "jobTitle" TEXT,
    "isOwner" BOOLEAN NOT NULL DEFAULT false,
    "employmentType" "TeamEmploymentType" NOT NULL DEFAULT 'FREELANCE',
    "payType" "TeamPayType",
    "startDate" DATE,
    "endDate" DATE,
    "exitReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "TeamMember_userId_key" ON "TeamMember"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TeamMember_endDate_idx" ON "TeamMember"("endDate");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TeamMember_nameKey_idx" ON "TeamMember"("nameKey");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TeamMember_userId_fkey') THEN
    ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

COMMIT;
