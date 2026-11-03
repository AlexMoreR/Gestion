-- Notas por orden (pedido de Emanuel, 3-nov-2026). Solo aditiva: tabla nueva, no toca datos.
BEGIN;

CREATE TABLE IF NOT EXISTS "OrderNote" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "OrderNote_orderId_createdAt_idx" ON "OrderNote"("orderId", "createdAt");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrderNote_orderId_fkey') THEN
        ALTER TABLE "OrderNote" ADD CONSTRAINT "OrderNote_orderId_fkey"
            FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrderNote_createdById_fkey') THEN
        ALTER TABLE "OrderNote" ADD CONSTRAINT "OrderNote_createdById_fkey"
            FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

COMMIT;
