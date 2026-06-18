-- CreateEnum
CREATE TYPE "DeliveryType" AS ENUM ('COUNTER', 'PICKUP', 'SHIPPING');

-- AlterTable
ALTER TABLE "Dispatch" ADD COLUMN     "deliveryPhotoName" TEXT,
ADD COLUMN     "deliveryPhotoUrl" TEXT,
ADD COLUMN     "deliveryType" "DeliveryType" NOT NULL DEFAULT 'SHIPPING';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "instagram" TEXT,
ADD COLUMN     "tiktok" TEXT;
