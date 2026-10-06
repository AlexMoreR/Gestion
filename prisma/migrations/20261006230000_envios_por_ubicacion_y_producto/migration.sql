-- Envios por ubicacion y por producto (aditiva: no borra ni cambia columnas existentes).
-- 1) Tipo de envio por ciudad/corregimiento: GRATIS, ADICIONAL, COTIZAR, NO_LLEGA.
--    NULL = comportamiento de siempre (freeShipping true -> GRATIS, false -> COTIZAR).
-- 2) Nombre normalizado (sin acentos, minusculas) para buscar y no duplicar.
-- 3) Ubicaciones nuevas que llegan desde el CRM quedan "pendientes de revisar".
-- 4) Valor del envio ADICIONAL por categoria y, opcional, por producto (pisa la categoria).

CREATE TYPE "ShippingType" AS ENUM ('GRATIS', 'ADICIONAL', 'COTIZAR', 'NO_LLEGA');

ALTER TABLE "TransportCity"
  ADD COLUMN "shippingType" "ShippingType",
  ADD COLUMN "nameKey" TEXT,
  ADD COLUMN "needsReview" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'DANE';

ALTER TABLE "TransportLocality"
  ADD COLUMN "shippingType" "ShippingType",
  ADD COLUMN "nameKey" TEXT,
  ADD COLUMN "needsReview" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'DANE';

UPDATE "TransportCity"
SET "nameKey" = lower(btrim(regexp_replace(translate("name", 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'), '\s+', ' ', 'g')));

UPDATE "TransportLocality"
SET "nameKey" = lower(btrim(regexp_replace(translate("name", 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'), '\s+', ' ', 'g')));

-- Indices NO unicos a proposito: la no-duplicacion se controla en el codigo, asi esta
-- migracion nunca falla por datos repetidos en produccion.
CREATE INDEX "TransportCity_nameKey_idx" ON "TransportCity"("nameKey");
CREATE INDEX "TransportLocality_nameKey_idx" ON "TransportLocality"("nameKey");
CREATE INDEX "TransportLocality_cityId_nameKey_idx" ON "TransportLocality"("cityId", "nameKey");

ALTER TABLE "Category" ADD COLUMN "shippingExtra" INTEGER;
ALTER TABLE "Product" ADD COLUMN "shippingExtra" INTEGER;

-- Valores iniciales aprobados por Alexander (6 oct 2026): camillas y combos de camillas 100.000,
-- sillas 50.000. Lo demas queda NULL = "se cotiza" hasta que se cargue en el panel.
UPDATE "Category" SET "shippingExtra" = 100000
WHERE lower(translate("name", 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')) IN ('camilla', 'camillas', 'combo de camillas');

UPDATE "Category" SET "shippingExtra" = 50000
WHERE lower(translate("name", 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')) LIKE 'sillas%';

-- Envio gratis aprobado por Alexander (6 oct 2026): 13 municipios de la Sabana, Medellin y Bucaramanga.
UPDATE "TransportCity" SET "freeShipping" = true, "shippingType" = 'GRATIS'
WHERE "code" IN ('25754', '25175', '25473', '25286', '25214', '25377', '25126', '25430',
                 '25817', '25899', '25269', '25758', '25386', '05001', '68001');
