BEGIN;

-- T-539 (intento 2, nov-2026): corrige UNA palabra mal escrita en el nombre de 5 productos.
-- Solo toca "name" (y "updatedAt"): nunca slug, precio ni código. Cada UPDATE solo cambia algo si la
-- palabra mala sigue en el nombre, así correrla dos veces o tras una corrección a mano no hace nada.
-- \m y \M = inicio y fin de palabra en Postgres (como el script scripts/corregir-nombres-productos.mjs).
UPDATE "Product"
SET "name" = regexp_replace("name", '\mEMALTERO\M', 'ESMALTERO', 'i'), "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'ESV010' AND "name" ~* '\mEMALTERO\M';

UPDATE "Product"
SET "name" = regexp_replace("name", '\mLAHISTA\M', 'LASHISTA', 'i'), "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'CMB015' AND "name" ~* '\mLAHISTA\M';

UPDATE "Product"
SET "name" = regexp_replace("name", '\mRETANGULAR\M', 'RECTANGULAR', 'i'), "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'SNV004' AND "name" ~* '\mRETANGULAR\M';

UPDATE "Product"
SET "name" = regexp_replace("name", '\mMANY\s+Y\s+PEDI\M', 'MANÍ Y PEDÍ', 'i'), "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'SMV001' AND "name" ~* '\mMANY\s+Y\s+PEDI\M';

-- Solo al final del nombre, para no tocar "3 PIEZAS".
UPDATE "Product"
SET "name" = regexp_replace("name", '\m3\s+PIEZA\s*$', '3 PIEZAS', 'i'), "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'CMB009' AND "name" ~* '\m3\s+PIEZA\s*$';

-- Firma de la migración (convención del repo): su propia línea en la bitácora.
INSERT INTO "ActivityLog" ("id", "actorId", "actorName", "action", "entityType", "entityId", "summary", "createdAt", "origin", "ticket", "commitSha")
VALUES (
    'migracion-20261113120000-corregir-nombres', NULL, 'Migración', 'UPDATE', 'PRODUCT', NULL,
    'Corrigió el nombre de 5 productos: ESV010 ESMALTERO, CMB015 LASHISTA, SNV004 RECTANGULAR, SMV001 MANÍ Y PEDÍ, CMB009 3 PIEZAS',
    CURRENT_TIMESTAMP, 'MIGRACION', 'dkw0xxpy', NULL
)
ON CONFLICT ("id") DO NOTHING;

COMMIT;
