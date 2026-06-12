-- Orders / production / dispatch module. These models exist in schema.prisma
-- (added via `prisma db push` locally) but had no migration, so production was
-- missing the `Product.fulfillmentMode` column, the enums, and 6 tables.
-- Guarded so it is safe to apply on a partially-migrated database.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProductFulfillmentMode') THEN
    CREATE TYPE "ProductFulfillmentMode" AS ENUM ('STOCK', 'MANUFACTURE', 'MIXED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OrderStatus') THEN
    CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'RELEASED', 'IN_PRODUCTION', 'READY_FOR_DISPATCH', 'DISPATCHED', 'COMPLETED', 'CANCELLED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProductionJobStatus') THEN
    CREATE TYPE "ProductionJobStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'PAUSED', 'DONE', 'CANCELLED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DispatchStatus') THEN
    CREATE TYPE "DispatchStatus" AS ENUM ('PENDING', 'PACKING', 'SHIPPED', 'DELIVERED', 'RETURNED', 'CANCELLED');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Product.fulfillmentMode (this is what was breaking the storefront)
-- ---------------------------------------------------------------------------
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "fulfillmentMode" "ProductFulfillmentMode" NOT NULL DEFAULT 'STOCK';

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "Order" (
  "id"           TEXT NOT NULL,
  "code"         TEXT NOT NULL,
  "saleId"       TEXT NOT NULL,
  "quoteId"      TEXT NOT NULL,
  "clientId"     TEXT NOT NULL,
  "createdById"  TEXT NOT NULL,
  "assignedToId" TEXT,
  "status"       "OrderStatus" NOT NULL DEFAULT 'DRAFT',
  "notes"        TEXT,
  "internalNotes" TEXT,
  "committedAt"  TIMESTAMP(3),
  "releasedAt"   TIMESTAMP(3),
  "completedAt"  TIMESTAMP(3),
  "subtotal"     DECIMAL(12,2) NOT NULL DEFAULT 0,
  "total"        DECIMAL(12,2) NOT NULL DEFAULT 0,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "OrderItem" (
  "id"              TEXT NOT NULL,
  "orderId"         TEXT NOT NULL,
  "quoteItemId"     TEXT,
  "productId"       TEXT NOT NULL,
  "quantity"        INTEGER NOT NULL,
  "unitPrice"       DECIMAL(12,2) NOT NULL,
  "lineTotal"       DECIMAL(12,2) NOT NULL,
  "fulfillmentMode" "ProductFulfillmentMode" NOT NULL,
  "notes"           TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ProductionJob" (
  "id"           TEXT NOT NULL,
  "code"         TEXT NOT NULL,
  "orderId"      TEXT NOT NULL,
  "orderItemId"  TEXT,
  "status"       "ProductionJobStatus" NOT NULL DEFAULT 'PENDING',
  "quantity"     INTEGER NOT NULL,
  "notes"        TEXT,
  "dueDate"      TIMESTAMP(3),
  "startedAt"    TIMESTAMP(3),
  "completedAt"  TIMESTAMP(3),
  "assignedToId" TEXT,
  "createdById"  TEXT NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductionJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Dispatch" (
  "id"             TEXT NOT NULL,
  "code"           TEXT NOT NULL,
  "orderId"        TEXT NOT NULL,
  "status"         "DispatchStatus" NOT NULL DEFAULT 'PENDING',
  "carrierName"    TEXT,
  "trackingNumber" TEXT,
  "shippingAddress" TEXT,
  "notes"          TEXT,
  "packedAt"       TIMESTAMP(3),
  "shippedAt"      TIMESTAMP(3),
  "deliveredAt"    TIMESTAMP(3),
  "createdById"    TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Dispatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DispatchItem" (
  "id"          TEXT NOT NULL,
  "dispatchId"  TEXT NOT NULL,
  "orderItemId" TEXT NOT NULL,
  "quantity"    INTEGER NOT NULL,
  "notes"       TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DispatchItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "OrderStatusHistory" (
  "id"          TEXT NOT NULL,
  "orderId"     TEXT NOT NULL,
  "fromStatus"  "OrderStatus",
  "toStatus"    "OrderStatus" NOT NULL,
  "note"        TEXT,
  "changedById" TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderStatusHistory_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- Unique indexes
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS "Order_code_key"            ON "Order"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "Order_saleId_key"          ON "Order"("saleId");
CREATE UNIQUE INDEX IF NOT EXISTS "OrderItem_quoteItemId_key" ON "OrderItem"("quoteItemId");
CREATE UNIQUE INDEX IF NOT EXISTS "ProductionJob_code_key"    ON "ProductionJob"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "Dispatch_code_key"         ON "Dispatch"("code");

-- ---------------------------------------------------------------------------
-- Secondary indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "Order_clientId_createdAt_idx"            ON "Order"("clientId", "createdAt");
CREATE INDEX IF NOT EXISTS "Order_createdById_createdAt_idx"         ON "Order"("createdById", "createdAt");
CREATE INDEX IF NOT EXISTS "Order_assignedToId_createdAt_idx"        ON "Order"("assignedToId", "createdAt");
CREATE INDEX IF NOT EXISTS "Order_quoteId_createdAt_idx"             ON "Order"("quoteId", "createdAt");
CREATE INDEX IF NOT EXISTS "OrderItem_orderId_idx"                   ON "OrderItem"("orderId");
CREATE INDEX IF NOT EXISTS "OrderItem_productId_idx"                 ON "OrderItem"("productId");
CREATE INDEX IF NOT EXISTS "ProductionJob_orderId_idx"              ON "ProductionJob"("orderId");
CREATE INDEX IF NOT EXISTS "ProductionJob_orderItemId_idx"          ON "ProductionJob"("orderItemId");
CREATE INDEX IF NOT EXISTS "ProductionJob_assignedToId_createdAt_idx" ON "ProductionJob"("assignedToId", "createdAt");
CREATE INDEX IF NOT EXISTS "Dispatch_orderId_idx"                   ON "Dispatch"("orderId");
CREATE INDEX IF NOT EXISTS "Dispatch_createdById_createdAt_idx"     ON "Dispatch"("createdById", "createdAt");
CREATE INDEX IF NOT EXISTS "DispatchItem_dispatchId_idx"            ON "DispatchItem"("dispatchId");
CREATE INDEX IF NOT EXISTS "DispatchItem_orderItemId_idx"           ON "DispatchItem"("orderItemId");
CREATE INDEX IF NOT EXISTS "OrderStatusHistory_orderId_createdAt_idx"    ON "OrderStatusHistory"("orderId", "createdAt");
CREATE INDEX IF NOT EXISTS "OrderStatusHistory_changedById_createdAt_idx" ON "OrderStatusHistory"("changedById", "createdAt");

-- ---------------------------------------------------------------------------
-- Foreign keys (guarded — ADD CONSTRAINT has no IF NOT EXISTS)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Order_saleId_fkey') THEN
    ALTER TABLE "Order" ADD CONSTRAINT "Order_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Order_quoteId_fkey') THEN
    ALTER TABLE "Order" ADD CONSTRAINT "Order_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Order_clientId_fkey') THEN
    ALTER TABLE "Order" ADD CONSTRAINT "Order_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Order_createdById_fkey') THEN
    ALTER TABLE "Order" ADD CONSTRAINT "Order_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Order_assignedToId_fkey') THEN
    ALTER TABLE "Order" ADD CONSTRAINT "Order_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrderItem_orderId_fkey') THEN
    ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrderItem_quoteItemId_fkey') THEN
    ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_quoteItemId_fkey" FOREIGN KEY ("quoteItemId") REFERENCES "QuoteItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrderItem_productId_fkey') THEN
    ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductionJob_orderId_fkey') THEN
    ALTER TABLE "ProductionJob" ADD CONSTRAINT "ProductionJob_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductionJob_orderItemId_fkey') THEN
    ALTER TABLE "ProductionJob" ADD CONSTRAINT "ProductionJob_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductionJob_assignedToId_fkey') THEN
    ALTER TABLE "ProductionJob" ADD CONSTRAINT "ProductionJob_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductionJob_createdById_fkey') THEN
    ALTER TABLE "ProductionJob" ADD CONSTRAINT "ProductionJob_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Dispatch_orderId_fkey') THEN
    ALTER TABLE "Dispatch" ADD CONSTRAINT "Dispatch_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Dispatch_createdById_fkey') THEN
    ALTER TABLE "Dispatch" ADD CONSTRAINT "Dispatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DispatchItem_dispatchId_fkey') THEN
    ALTER TABLE "DispatchItem" ADD CONSTRAINT "DispatchItem_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "Dispatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DispatchItem_orderItemId_fkey') THEN
    ALTER TABLE "DispatchItem" ADD CONSTRAINT "DispatchItem_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrderStatusHistory_orderId_fkey') THEN
    ALTER TABLE "OrderStatusHistory" ADD CONSTRAINT "OrderStatusHistory_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrderStatusHistory_changedById_fkey') THEN
    ALTER TABLE "OrderStatusHistory" ADD CONSTRAINT "OrderStatusHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
