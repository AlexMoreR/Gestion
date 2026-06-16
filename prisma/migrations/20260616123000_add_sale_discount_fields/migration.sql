-- Persist gross total and discount amount for sales created from quotes.
-- Guarded so it can be applied safely on databases with partial drift.

ALTER TABLE "Sale"
  ADD COLUMN IF NOT EXISTS "grossTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;
