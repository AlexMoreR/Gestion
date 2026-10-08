-- Guias viejas con codigo al azar (pedido de Alexander, 8-oct-2026: el cliente veia "MG-000001"
-- y pensaba "soy el primero").
-- Migracion ADITIVA: agrega la columna opcional "legacyCode" y, para cada guia con el formato
-- viejo secuencial (MG- seguido solo de digitos), guarda ese numero en "legacyCode" y le asigna
-- en "code" un codigo nuevo al azar con el mismo formato de las guias nuevas:
-- MG- + 8 caracteres del alfabeto ABCDEFGHJKMNPQRSTUVWXYZ23456789 (sin O/0 ni I/1/L).
-- No borra datos: el numero viejo queda en "legacyCode" y la busqueda lo sigue aceptando.

-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN "legacyCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_legacyCode_key" ON "Shipment"("legacyCode");

-- Recodificar las guias viejas
DO $$
DECLARE
  alphabet CONSTANT TEXT := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  shipment_row RECORD;
  candidate TEXT;
  attempts INT;
BEGIN
  FOR shipment_row IN
    SELECT "id", "code" FROM "Shipment"
    WHERE "code" ~ '^MG-[0-9]+$' AND "legacyCode" IS NULL
    ORDER BY "createdAt"
  LOOP
    attempts := 0;
    LOOP
      attempts := attempts + 1;
      IF attempts > 50 THEN
        RAISE EXCEPTION 'No se pudo generar un codigo unico para la guia %', shipment_row."id";
      END IF;
      SELECT 'MG-' || string_agg(substr(alphabet, 1 + floor(random() * length(alphabet))::INT, 1), '')
        INTO candidate
        FROM generate_series(1, 8);
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM "Shipment" WHERE "code" = candidate OR "legacyCode" = candidate
      );
    END LOOP;

    UPDATE "Shipment"
      SET "legacyCode" = shipment_row."code",
          "code" = candidate
      WHERE "id" = shipment_row."id";
  END LOOP;
END $$;
