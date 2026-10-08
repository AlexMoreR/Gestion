-- Precio normal y oferta con fechas (decision de Alexander, 8-oct-2026: "Tachado con respaldo").
-- Migracion SOLO ADITIVA: agrega columnas opcionales (NULL por defecto) en Product.
-- No modifica ni borra datos: los productos quedan sin precio normal ni oferta.

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "regularPrice" DECIMAL(10,2),
ADD COLUMN "promoPrice" DECIMAL(10,2),
ADD COLUMN "promoStartsAt" TIMESTAMP(3),
ADD COLUMN "promoEndsAt" TIMESTAMP(3);
