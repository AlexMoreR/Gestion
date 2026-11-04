BEGIN;
ALTER TABLE "TransportCity" ADD COLUMN IF NOT EXISTS "cashOnDeliveryShipping" INTEGER;
ALTER TABLE "TransportLocality" ADD COLUMN IF NOT EXISTS "cashOnDeliveryShipping" INTEGER;
COMMIT;
