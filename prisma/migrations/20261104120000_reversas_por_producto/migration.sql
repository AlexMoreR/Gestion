-- Reversas de entrega/despacho con motivo (parte 1). Solo aditiva: tabla y columna nuevas, no toca datos.
BEGIN;

CREATE TABLE IF NOT EXISTS "OrderItemReversal" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderItemId" TEXT,
    "dispatchId" TEXT,
    "fromState" TEXT NOT NULL,
    "toState" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "reasonText" TEXT,
    "comment" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderItemReversal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "OrderItemReversal_orderId_createdAt_idx" ON "OrderItemReversal"("orderId", "createdAt");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrderItemReversal_orderId_fkey') THEN
        ALTER TABLE "OrderItemReversal" ADD CONSTRAINT "OrderItemReversal_orderId_fkey"
            FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrderItemReversal_orderItemId_fkey') THEN
        ALTER TABLE "OrderItemReversal" ADD CONSTRAINT "OrderItemReversal_orderItemId_fkey"
            FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrderItemReversal_dispatchId_fkey') THEN
        ALTER TABLE "OrderItemReversal" ADD CONSTRAINT "OrderItemReversal_dispatchId_fkey"
            FOREIGN KEY ("dispatchId") REFERENCES "Dispatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrderItemReversal_createdById_fkey') THEN
        ALTER TABLE "OrderItemReversal" ADD CONSTRAINT "OrderItemReversal_createdById_fkey"
            FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

ALTER TABLE "DispatchItem" ADD COLUMN IF NOT EXISTS "deliveryReversedAt" TIMESTAMP(3);

COMMIT;
