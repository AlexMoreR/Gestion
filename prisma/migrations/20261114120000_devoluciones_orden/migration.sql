-- Devoluciones de órdenes (parte 1). Solo aditiva: tres tablas nuevas, no toca datos ni crea enums.
BEGIN;

CREATE TABLE IF NOT EXISTS "OrderReturn" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "dispatchId" TEXT,
    "returnDate" DATE NOT NULL,
    "dispatchStatusBefore" "DispatchStatus",
    "carrierSupplierId" TEXT,
    "carrierName" TEXT,
    "reason" TEXT NOT NULL,
    "reasonText" TEXT,
    "comment" TEXT,
    "location" TEXT NOT NULL,
    "nextStep" TEXT NOT NULL,
    "returnFreight" DECIMAL(12,2),
    "sellerNotifiedAt" TIMESTAMP(3),
    "sellerNotifiedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "annulledAt" TIMESTAMP(3),
    "annulReason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderReturn_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "OrderReturnItem" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    CONSTRAINT "OrderReturnItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "OrderReturnFile" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderReturnFile_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "OrderReturn_orderId_createdAt_idx" ON "OrderReturn"("orderId", "createdAt");
CREATE INDEX IF NOT EXISTS "OrderReturn_dispatchId_idx" ON "OrderReturn"("dispatchId");
CREATE INDEX IF NOT EXISTS "OrderReturnItem_returnId_idx" ON "OrderReturnItem"("returnId");
CREATE INDEX IF NOT EXISTS "OrderReturnItem_orderItemId_idx" ON "OrderReturnItem"("orderItemId");
CREATE INDEX IF NOT EXISTS "OrderReturnFile_returnId_idx" ON "OrderReturnFile"("returnId");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrderReturn_orderId_fkey') THEN
        ALTER TABLE "OrderReturn" ADD CONSTRAINT "OrderReturn_orderId_fkey"
            FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrderReturn_dispatchId_fkey') THEN
        ALTER TABLE "OrderReturn" ADD CONSTRAINT "OrderReturn_dispatchId_fkey"
            FOREIGN KEY ("dispatchId") REFERENCES "Dispatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrderReturn_carrierSupplierId_fkey') THEN
        ALTER TABLE "OrderReturn" ADD CONSTRAINT "OrderReturn_carrierSupplierId_fkey"
            FOREIGN KEY ("carrierSupplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrderReturn_sellerNotifiedById_fkey') THEN
        ALTER TABLE "OrderReturn" ADD CONSTRAINT "OrderReturn_sellerNotifiedById_fkey"
            FOREIGN KEY ("sellerNotifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrderReturn_createdById_fkey') THEN
        ALTER TABLE "OrderReturn" ADD CONSTRAINT "OrderReturn_createdById_fkey"
            FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrderReturnItem_returnId_fkey') THEN
        ALTER TABLE "OrderReturnItem" ADD CONSTRAINT "OrderReturnItem_returnId_fkey"
            FOREIGN KEY ("returnId") REFERENCES "OrderReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrderReturnItem_orderItemId_fkey') THEN
        ALTER TABLE "OrderReturnItem" ADD CONSTRAINT "OrderReturnItem_orderItemId_fkey"
            FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrderReturnFile_returnId_fkey') THEN
        ALTER TABLE "OrderReturnFile" ADD CONSTRAINT "OrderReturnFile_returnId_fkey"
            FOREIGN KEY ("returnId") REFERENCES "OrderReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrderReturnFile_uploadedById_fkey') THEN
        ALTER TABLE "OrderReturnFile" ADD CONSTRAINT "OrderReturnFile_uploadedById_fkey"
            FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

COMMIT;
