-- Compra por lote a proveedora, parte 1 (nov-2026). Solo aditiva: tabla nueva, no toca datos.
BEGIN;

CREATE TABLE IF NOT EXISTS "CompraUnidad" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "ubicacion" TEXT,
    "color" TEXT,
    "saleOrderId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CompraUnidad_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CompraUnidad_orderId_idx" ON "CompraUnidad"("orderId");
CREATE INDEX IF NOT EXISTS "CompraUnidad_productId_idx" ON "CompraUnidad"("productId");
CREATE INDEX IF NOT EXISTS "CompraUnidad_estado_idx" ON "CompraUnidad"("estado");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CompraUnidad_orderId_fkey') THEN
        ALTER TABLE "CompraUnidad" ADD CONSTRAINT "CompraUnidad_orderId_fkey"
            FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CompraUnidad_saleOrderId_fkey') THEN
        ALTER TABLE "CompraUnidad" ADD CONSTRAINT "CompraUnidad_saleOrderId_fkey"
            FOREIGN KEY ("saleOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CompraUnidad_productId_fkey') THEN
        ALTER TABLE "CompraUnidad" ADD CONSTRAINT "CompraUnidad_productId_fkey"
            FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

COMMIT;
