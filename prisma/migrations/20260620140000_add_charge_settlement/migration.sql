-- AlterTable
ALTER TABLE "SupplierLedgerEntry" ADD COLUMN "settlesEntryId" TEXT;

-- CreateIndex
CREATE INDEX "SupplierLedgerEntry_settlesEntryId_idx" ON "SupplierLedgerEntry"("settlesEntryId");

-- AddForeignKey
ALTER TABLE "SupplierLedgerEntry" ADD CONSTRAINT "SupplierLedgerEntry_settlesEntryId_fkey" FOREIGN KEY ("settlesEntryId") REFERENCES "SupplierLedgerEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
