-- Guias Magilus (Fase 1). Migracion SOLO ADITIVA: crea enums, tablas, indices y llaves nuevas.
-- No modifica ni borra columnas existentes.

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('CREATED', 'PICKED_UP', 'IN_WAREHOUSE', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'RETURNED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ShipmentEventKind" AS ENUM ('STATUS', 'INCIDENT', 'NOTE', 'ETA_CHANGE');

-- CreateEnum
CREATE TYPE "ShipmentIncident" AS ENUM ('POLICE_INSPECTION', 'WEATHER', 'HEAVY_TRAFFIC', 'ROAD_BLOCK', 'VEHICLE_ISSUE', 'ADDRESS_ISSUE', 'RECIPIENT_ABSENT', 'DAMAGE', 'OTHER');

-- CreateEnum
CREATE TYPE "ShipmentActor" AS ENUM ('MAGILUS', 'CARRIER', 'SYSTEM');

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "dispatchId" TEXT NOT NULL,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'CREATED',
    "destinationCityId" TEXT,
    "originCityId" TEXT,
    "currentCityId" TEXT,
    "estimatedDelivery" TIMESTAMP(3),
    "etaIsManual" BOOLEAN NOT NULL DEFAULT false,
    "deliveredAt" TIMESTAMP(3),
    "collectOnDelivery" BOOLEAN NOT NULL DEFAULT false,
    "amountToCollect" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "receivedByName" TEXT,
    "deliveryPhotoUrl" TEXT,
    "phoneLast4" TEXT,
    "publicEnabled" BOOLEAN NOT NULL DEFAULT true,
    "carrierToken" TEXT NOT NULL,
    "carrierTokenActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentEvent" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "kind" "ShipmentEventKind" NOT NULL,
    "status" "ShipmentStatus",
    "incident" "ShipmentIncident",
    "note" TEXT,
    "cityId" TEXT,
    "photoUrl" TEXT,
    "newEta" TIMESTAMP(3),
    "visibleToClient" BOOLEAN NOT NULL DEFAULT true,
    "actor" "ShipmentActor" NOT NULL,
    "actorUserId" TEXT,
    "actorLabel" TEXT,
    "ipHash" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipmentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentLookupAttempt" (
    "id" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipmentLookupAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_code_key" ON "Shipment"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_dispatchId_key" ON "Shipment"("dispatchId");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_carrierToken_key" ON "Shipment"("carrierToken");

-- CreateIndex
CREATE INDEX "Shipment_status_updatedAt_idx" ON "Shipment"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "Shipment_createdAt_idx" ON "Shipment"("createdAt");

-- CreateIndex
CREATE INDEX "ShipmentEvent_shipmentId_occurredAt_idx" ON "ShipmentEvent"("shipmentId", "occurredAt");

-- CreateIndex
CREATE INDEX "ShipmentLookupAttempt_ipHash_createdAt_idx" ON "ShipmentLookupAttempt"("ipHash", "createdAt");

-- CreateIndex
CREATE INDEX "ShipmentLookupAttempt_code_createdAt_idx" ON "ShipmentLookupAttempt"("code", "createdAt");

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "Dispatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_destinationCityId_fkey" FOREIGN KEY ("destinationCityId") REFERENCES "TransportCity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_originCityId_fkey" FOREIGN KEY ("originCityId") REFERENCES "TransportCity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_currentCityId_fkey" FOREIGN KEY ("currentCityId") REFERENCES "TransportCity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentEvent" ADD CONSTRAINT "ShipmentEvent_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentEvent" ADD CONSTRAINT "ShipmentEvent_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "TransportCity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentEvent" ADD CONSTRAINT "ShipmentEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

