-- Origen de cada venta (decision de Alexander, 7-oct-2026). Migracion SOLO ADITIVA:
-- crea un enum, columnas opcionales (NULL por defecto) en Quote y Sale y un indice.
-- No modifica ni borra datos: las ventas viejas quedan en NULL (= "Sin dato") hasta el relleno.

-- CreateEnum
CREATE TYPE "SaleOrigin" AS ENUM ('META_ADS', 'MARKETPLACE', 'REFERIDO', 'RECURRENTE', 'MOSTRADOR', 'SIN_DATO');

-- AlterTable: el CRM avisa el origen de la cotizacion al marcar GANADO
ALTER TABLE "Quote" ADD COLUMN "origin" "SaleOrigin",
ADD COLUMN "originDetail" JSONB;

-- AlterTable: la venta copia el origen de su cotizacion al crearse
ALTER TABLE "Sale" ADD COLUMN "origin" "SaleOrigin",
ADD COLUMN "originDetail" JSONB;

-- CreateIndex: filtro y reporte por origen en /admin/ventas
CREATE INDEX "Sale_origin_idx" ON "Sale"("origin");
