-- Reconcile relation tables used by the storefront product query
-- (ProductImage, Supplier, ProductSupplier). Product/Category were already
-- confirmed complete. Fully idempotent: adds only what is missing, backfills,
-- then enforces NOT NULL. Never drops data.

-- ---------------------------------------------------------------------------
-- ProductImage
-- ---------------------------------------------------------------------------
ALTER TABLE "ProductImage" ADD COLUMN IF NOT EXISTS "url"       TEXT;
ALTER TABLE "ProductImage" ADD COLUMN IF NOT EXISTS "order"     INTEGER;
ALTER TABLE "ProductImage" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "ProductImage" SET "url" = COALESCE("url", '') WHERE "url" IS NULL;
UPDATE "ProductImage" SET "order" = COALESCE("order", 0) WHERE "order" IS NULL;

ALTER TABLE "ProductImage" ALTER COLUMN "url"   SET NOT NULL;
ALTER TABLE "ProductImage" ALTER COLUMN "order" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "ProductImage_productId_idx" ON "ProductImage"("productId");

-- ---------------------------------------------------------------------------
-- Supplier
-- ---------------------------------------------------------------------------
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "email"     TEXT;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "phone"     TEXT;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "isActive"  BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ---------------------------------------------------------------------------
-- ProductSupplier
-- ---------------------------------------------------------------------------
ALTER TABLE "ProductSupplier" ADD COLUMN IF NOT EXISTS "supplierSku"  TEXT;
ALTER TABLE "ProductSupplier" ADD COLUMN IF NOT EXISTS "supplierCost" DECIMAL(10,2);
ALTER TABLE "ProductSupplier" ADD COLUMN IF NOT EXISTS "isPreferred"  BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ProductSupplier" ADD COLUMN IF NOT EXISTS "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
