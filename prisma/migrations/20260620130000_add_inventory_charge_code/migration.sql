-- AlterTable
ALTER TABLE "SupplierLedgerEntry" ADD COLUMN "code" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "SupplierLedgerEntry_code_key" ON "SupplierLedgerEntry"("code");

-- Backfill: numera los cargos de inventario existentes (INV-00001...) por orden de creación.
WITH numbered AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, "id" ASC) AS rn
  FROM "SupplierLedgerEntry"
  WHERE "type" = 'CHARGE'
    AND "orderId" IS NULL
    AND ("inventoryMovementId" IS NOT NULL OR "note" LIKE 'Compra inventario%')
)
UPDATE "SupplierLedgerEntry" s
SET "code" = 'INV-' || LPAD(numbered.rn::text, 5, '0')
FROM numbered
WHERE s."id" = numbered."id";

-- Backfill: numera los cargos manuales existentes (MAN-00001...) por orden de creación.
WITH numbered AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, "id" ASC) AS rn
  FROM "SupplierLedgerEntry"
  WHERE "type" = 'CHARGE'
    AND "orderId" IS NULL
    AND "inventoryMovementId" IS NULL
    AND ("note" IS NULL OR "note" NOT LIKE 'Compra inventario%')
)
UPDATE "SupplierLedgerEntry" s
SET "code" = 'MAN-' || LPAD(numbered.rn::text, 5, '0')
FROM numbered
WHERE s."id" = numbered."id";
