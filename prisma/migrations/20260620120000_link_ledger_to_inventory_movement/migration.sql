-- AlterTable
ALTER TABLE "SupplierLedgerEntry" ADD COLUMN "inventoryMovementId" TEXT;

-- CreateIndex
CREATE INDEX "SupplierLedgerEntry_inventoryMovementId_idx" ON "SupplierLedgerEntry"("inventoryMovementId");

-- AddForeignKey
ALTER TABLE "SupplierLedgerEntry" ADD CONSTRAINT "SupplierLedgerEntry_inventoryMovementId_fkey" FOREIGN KEY ("inventoryMovementId") REFERENCES "InventoryMovement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
