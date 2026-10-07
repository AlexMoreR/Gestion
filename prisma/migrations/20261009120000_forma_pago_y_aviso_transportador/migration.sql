-- Forma de pago de la venta y aviso del transportador. Migracion SOLO ADITIVA:
-- crea un enum y dos columnas opcionales (NULL por defecto). No modifica ni borra datos.

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('ANTICIPO_50_50', 'CONTRAENTREGA');

-- AlterTable: NULL = sin definir (ventas viejas)
ALTER TABLE "Sale" ADD COLUMN "paymentMethod" "PaymentMethod";

-- AlterTable: texto que se muestra al elegir este proveedor como transportador en un despacho
ALTER TABLE "Supplier" ADD COLUMN "dispatchWarning" TEXT;
