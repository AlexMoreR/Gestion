-- Reconcile schema drift on Product/Category.
-- The _prisma_migrations table reports all migrations as applied, but some
-- columns are missing in the real database (P2022). This migration is fully
-- idempotent: it adds only the columns/indexes that are missing and never
-- touches existing data.

-- ---------------------------------------------------------------------------
-- Product: simple nullable columns
-- ---------------------------------------------------------------------------
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "description"    TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "code"           TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "seoTitle"       TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "seoDescription" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "categoryId"     TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Product_code_key" ON "Product"("code");

-- ---------------------------------------------------------------------------
-- Product: pricing columns (add nullable, backfill, then enforce NOT NULL)
-- ---------------------------------------------------------------------------
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "baseCost"           DECIMAL(10,2);
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "retailMarginPct"    DECIMAL(6,2);
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "wholesaleMarginPct" DECIMAL(6,2);
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "wholesalePrice"     DECIMAL(10,2);
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "minWholesaleQty"    INTEGER NOT NULL DEFAULT 6;

UPDATE "Product"
SET
  "baseCost"           = COALESCE("baseCost", "price"),
  "retailMarginPct"    = COALESCE("retailMarginPct", 0),
  "wholesaleMarginPct" = COALESCE("wholesaleMarginPct", 0),
  "wholesalePrice"     = COALESCE("wholesalePrice", "price")
WHERE
  "baseCost" IS NULL
  OR "retailMarginPct" IS NULL
  OR "wholesaleMarginPct" IS NULL
  OR "wholesalePrice" IS NULL;

ALTER TABLE "Product"
  ALTER COLUMN "baseCost"           SET NOT NULL,
  ALTER COLUMN "baseCost"           SET DEFAULT 0,
  ALTER COLUMN "retailMarginPct"    SET NOT NULL,
  ALTER COLUMN "retailMarginPct"    SET DEFAULT 0,
  ALTER COLUMN "wholesaleMarginPct" SET NOT NULL,
  ALTER COLUMN "wholesaleMarginPct" SET DEFAULT 0,
  ALTER COLUMN "wholesalePrice"     SET NOT NULL,
  ALTER COLUMN "wholesalePrice"     SET DEFAULT 0;

-- ---------------------------------------------------------------------------
-- Product: slug (add nullable, backfill unique slugs, enforce NOT NULL + unique)
-- ---------------------------------------------------------------------------
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "slug" TEXT;

WITH base_slugs AS (
  SELECT
    p."id",
    p."createdAt",
    trim(
      both '-' FROM regexp_replace(
        lower(
          translate(
            concat_ws(' ', p."name", COALESCE(p."code", '')),
            'ÁÀÄÂÃáàäâãÉÈËÊéèëêÍÌÏÎíìïîÓÒÖÔÕóòöôõÚÙÜÛúùüûÑñÇç',
            'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuNnCc'
          )
        ),
        '[^a-z0-9]+',
        '-',
        'g'
      )
    ) AS base_slug
  FROM "Product" p
  WHERE p."slug" IS NULL
),
ranked_slugs AS (
  SELECT
    "id",
    CASE
      WHEN row_number() OVER (PARTITION BY base_slug ORDER BY "createdAt", "id") = 1 THEN base_slug
      ELSE concat(base_slug, '-', row_number() OVER (PARTITION BY base_slug ORDER BY "createdAt", "id"))
    END AS slug
  FROM base_slugs
)
UPDATE "Product" p
SET "slug" = NULLIF(rs.slug, '')
FROM ranked_slugs rs
WHERE p."id" = rs."id";

-- Fallback for any rows whose generated slug ended up empty
UPDATE "Product" SET "slug" = "id" WHERE "slug" IS NULL OR "slug" = '';

ALTER TABLE "Product" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Product_slug_key" ON "Product"("slug");

-- ---------------------------------------------------------------------------
-- Product: foreign key to Category (guarded — IF NOT EXISTS not supported for constraints)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Product_categoryId_fkey'
  ) THEN
    ALTER TABLE "Product"
      ADD CONSTRAINT "Product_categoryId_fkey"
      FOREIGN KEY ("categoryId") REFERENCES "Category"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Category: SEO / logo columns
-- ---------------------------------------------------------------------------
ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "description"    TEXT;
ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "seoTitle"       TEXT;
ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "seoDescription" TEXT;
ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "logoUrl"        TEXT;
