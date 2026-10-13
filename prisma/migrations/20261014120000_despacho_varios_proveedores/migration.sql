-- Tramos del envio de un despacho: varios proveedores de transporte en un mismo despacho
-- (ej. Bogota -> Cali con un transportador y Cali -> cliente con otro). El valor del envio del
-- despacho (Dispatch.shippingCost) sigue siendo el total = suma de los tramos.
-- Migracion SOLO ADITIVA: no cambia ni borra columnas existentes.

-- CreateTable
CREATE TABLE "DispatchShippingLeg" (
    "id" TEXT NOT NULL,
    "dispatchId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "carrierSupplierId" TEXT,
    "carrierName" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "trackingNumber" TEXT,
    "note" TEXT,
    "legDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DispatchShippingLeg_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DispatchShippingLeg_dispatchId_position_idx" ON "DispatchShippingLeg"("dispatchId", "position");

-- CreateIndex
CREATE INDEX "DispatchShippingLeg_carrierSupplierId_idx" ON "DispatchShippingLeg"("carrierSupplierId");

-- AddForeignKey
ALTER TABLE "DispatchShippingLeg" ADD CONSTRAINT "DispatchShippingLeg_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "Dispatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchShippingLeg" ADD CONSTRAINT "DispatchShippingLeg_carrierSupplierId_fkey" FOREIGN KEY ("carrierSupplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Datos existentes: cada despacho con transportadora o valor de envio pasa a tener su primer
-- tramo (posicion 0) con la misma transportadora, el mismo valor y la misma guia. Asi la suma
-- de tramos = Dispatch.shippingCost desde el primer dia. Mostrador / recoge sin transportadora
-- ni valor no generan tramo. El id es determinista (leg0-<id del despacho>) para que volver a
-- correr este INSERT no duplique nada.
INSERT INTO "DispatchShippingLeg" (
    "id", "dispatchId", "position", "carrierSupplierId", "carrierName", "amount",
    "trackingNumber", "note", "legDate", "createdAt", "updatedAt"
)
SELECT
    'leg0-' || d."id",
    d."id",
    0,
    d."carrierSupplierId",
    COALESCE(NULLIF(TRIM(d."carrierName"), ''), s."name", 'Sin transportadora'),
    COALESCE(d."shippingCost", 0),
    NULLIF(TRIM(d."trackingNumber"), ''),
    NULL,
    COALESCE(d."shippedAt", d."createdAt"),
    d."createdAt",
    CURRENT_TIMESTAMP
FROM "Dispatch" d
LEFT JOIN "Supplier" s ON s."id" = d."carrierSupplierId"
WHERE d."carrierSupplierId" IS NOT NULL
   OR NULLIF(TRIM(d."carrierName"), '') IS NOT NULL
   OR COALESCE(d."shippingCost", 0) > 0
ON CONFLICT ("id") DO NOTHING;
