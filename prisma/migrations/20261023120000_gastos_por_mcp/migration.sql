-- Gastos por MCP (voz/chat): borrador de un gasto que espera la foto del soporte.
-- El gasto solo se crea cuando la foto pasa la revision; el enlace guarda solo su hash.
-- Migracion SOLO ADITIVA: crea un tipo y una tabla nueva; no cambia ni borra nada existente.

BEGIN;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'GastoBorradorEstado') THEN
    CREATE TYPE "GastoBorradorEstado" AS ENUM ('PENDIENTE', 'GUARDADO', 'RECHAZADO', 'VENCIDO');
  END IF;
END
$$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "GastoBorrador" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "expenseDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "motivoRetroactivo" TEXT,
    "employeeId" TEXT,
    "estado" "GastoBorradorEstado" NOT NULL DEFAULT 'PENDIENTE',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "ultimoMotivoRechazo" TEXT,
    "revision" JSONB,
    "expenseId" TEXT,
    "createdById" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiraEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GastoBorrador_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "GastoBorrador_tokenHash_key" ON "GastoBorrador"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "GastoBorrador_expenseId_key" ON "GastoBorrador"("expenseId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GastoBorrador_estado_expiraEn_idx" ON "GastoBorrador"("estado", "expiraEn");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'GastoBorrador_createdById_fkey') THEN
    ALTER TABLE "GastoBorrador" ADD CONSTRAINT "GastoBorrador_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'GastoBorrador_expenseId_fkey') THEN
    ALTER TABLE "GastoBorrador" ADD CONSTRAINT "GastoBorrador_expenseId_fkey"
      FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

COMMIT;
