-- Soporte de ordenes de compra (PURCHASE) en el modelo Order.

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('SALE', 'PURCHASE');

-- AlterTable: nuevas columnas
ALTER TABLE "Order" ADD COLUMN "type" "OrderType" NOT NULL DEFAULT 'SALE';
ALTER TABLE "Order" ADD COLUMN "supplierId" TEXT;

-- AlterTable: venta/cotizacion/cliente ahora opcionales (solo aplican a SALE)
ALTER TABLE "Order" ALTER COLUMN "saleId" DROP NOT NULL;
ALTER TABLE "Order" ALTER COLUMN "quoteId" DROP NOT NULL;
ALTER TABLE "Order" ALTER COLUMN "clientId" DROP NOT NULL;

-- Index + FK del proveedor
CREATE INDEX "Order_supplierId_createdAt_idx" ON "Order"("supplierId", "createdAt");

ALTER TABLE "Order" ADD CONSTRAINT "Order_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
