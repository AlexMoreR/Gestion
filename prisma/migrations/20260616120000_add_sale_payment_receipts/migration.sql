-- Persist the full set of payment receipts attached when sending a quote to sales.
-- Guarded so it can be applied safely to databases that already have the column.

ALTER TABLE "Sale"
  ADD COLUMN IF NOT EXISTS "paymentReceipts" JSONB;
