-- Pago a proveedora por MCP: enlace secreto (24 h, un solo uso) para subir la foto del comprobante
-- de un pago ya guardado. Solo se guarda el hash del token.
-- Migracion SOLO ADITIVA: crea una tabla nueva; no cambia ni borra nada existente.

BEGIN;

-- CreateTable
CREATE TABLE IF NOT EXISTS "PagoProveedoraBorrador" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "ledgerEntryId" TEXT NOT NULL,
    "expiraEn" TIMESTAMP(3) NOT NULL,
    "usadoEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PagoProveedoraBorrador_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PagoProveedoraBorrador_tokenHash_key" ON "PagoProveedoraBorrador"("tokenHash");
CREATE UNIQUE INDEX IF NOT EXISTS "PagoProveedoraBorrador_ledgerEntryId_key" ON "PagoProveedoraBorrador"("ledgerEntryId");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PagoProveedoraBorrador_ledgerEntryId_fkey') THEN
    ALTER TABLE "PagoProveedoraBorrador"
      ADD CONSTRAINT "PagoProveedoraBorrador_ledgerEntryId_fkey"
      FOREIGN KEY ("ledgerEntryId") REFERENCES "SupplierLedgerEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

COMMIT;
