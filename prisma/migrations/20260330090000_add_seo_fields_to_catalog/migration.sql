ALTER TABLE "Category"
ADD COLUMN "description" TEXT,
ADD COLUMN "seoTitle" TEXT,
ADD COLUMN "seoDescription" TEXT;

ALTER TABLE "Product"
ADD COLUMN "seoTitle" TEXT,
ADD COLUMN "seoDescription" TEXT;
