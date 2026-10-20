-- Registro de retroactivos: ventas, abonos y gastos con fecha de un dia anterior al dia real
-- del registro (hora Colombia) quedan en RegistroRetroactivo con quien, cuando y por que.
-- Sale.registradoEn = momento real de creacion (NULL en ventas viejas = sin dato).
-- SalePayment.createdById = quien registro el abono (NULL en abonos viejos = sin dato).
-- Migracion SOLO ADITIVA: no cambia, reescribe ni borra columnas ni datos existentes.

-- CreateEnum
CREATE TYPE "TipoRetroactivo" AS ENUM ('VENTA', 'ABONO', 'GASTO');

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "registradoEn" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SalePayment" ADD COLUMN     "createdById" TEXT;

-- CreateTable
CREATE TABLE "RegistroRetroactivo" (
    "id" TEXT NOT NULL,
    "tipo" "TipoRetroactivo" NOT NULL,
    "registroId" TEXT NOT NULL,
    "fechaPuesta" TIMESTAMP(3) NOT NULL,
    "registradoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuarioId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "monto" DECIMAL(14,2) NOT NULL,
    "creado" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegistroRetroactivo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RegistroRetroactivo_usuarioId_registradoEn_idx" ON "RegistroRetroactivo"("usuarioId", "registradoEn");

-- CreateIndex
CREATE INDEX "RegistroRetroactivo_tipo_registradoEn_idx" ON "RegistroRetroactivo"("tipo", "registradoEn");

-- CreateIndex
CREATE INDEX "RegistroRetroactivo_registroId_idx" ON "RegistroRetroactivo"("registroId");

-- CreateIndex
CREATE INDEX "SalePayment_createdById_idx" ON "SalePayment"("createdById");

-- AddForeignKey
ALTER TABLE "SalePayment" ADD CONSTRAINT "SalePayment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroRetroactivo" ADD CONSTRAINT "RegistroRetroactivo_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
