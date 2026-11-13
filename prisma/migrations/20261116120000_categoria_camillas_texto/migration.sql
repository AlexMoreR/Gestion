BEGIN;

-- fm96sadl (nov-2026): categoría /camilla, nombre y descripción nuevos (Agente SEO seo-2026-10-27-1 y -4).
-- Solo toca "name", "description", "seoDescription" y "updatedAt": nunca el slug (la dirección /camilla queda igual).
-- Solo cambia si la categoría sigue llamándose "Camillas de Masaje" y el nombre nuevo no existe ya, así correrla
-- dos veces o tras un cambio a mano no hace nada. Los números (modelos y precios) salen de lo que la tienda muestra
-- hoy: productos visibles con precio > 0 ("price", sin promociones). "seoDescription" se vacía (decisión del plan)
-- para que Google lea la descripción nueva; el valor anterior queda en "before" de la bitácora para deshacer.
CREATE TEMP TABLE "_camillas_antes" ON COMMIT DROP AS
SELECT c."id", c."name", c."description", c."seoDescription"
FROM "Category" c
WHERE c."slug" = 'camilla' AND c."name" = 'Camillas de Masaje'
  AND NOT EXISTS (SELECT 1 FROM "Category" o WHERE o."name" = 'Camillas para spa y masaje');

UPDATE "Category" c
SET "name" = 'Camillas para spa y masaje',
    "description" = 'Camillas para spa, masaje, cosmetología, pestañas y tatuaje. Tenemos ' || r."modelos" ||
      ' modelos de $' || replace(to_char(r."minimo", 'FM999,999,999'), ',', '.') ||
      ' a $' || replace(to_char(r."maximo", 'FM999,999,999'), ',', '.') ||
      ': divanes, portátil, de 2 y 3 cuerpos, curvas para lashista y en madera. Fábrica en Cali y Bogotá, envíos a toda Colombia. Cotiza por WhatsApp.',
    "seoDescription" = NULL,
    "updatedAt" = CURRENT_TIMESTAMP
FROM (
    SELECT p."categoryId", count(*) AS "modelos", min(p."price") AS "minimo", max(p."price") AS "maximo"
    FROM "Product" p
    WHERE p."hiddenFromStore" = false AND p."price" > 0
    GROUP BY p."categoryId"
) r
WHERE c."id" IN (SELECT "id" FROM "_camillas_antes") AND r."categoryId" = c."id";

-- Firma de la migración (convención del repo): su propia línea en la bitácora, con antes y después.
INSERT INTO "ActivityLog" ("id", "actorId", "actorName", "action", "entityType", "entityId", "summary", "createdAt", "before", "after", "origin", "ticket", "commitSha")
SELECT 'migracion-20261116120000-categoria-camillas', NULL, 'Migración', 'UPDATE'::"ActivityAction", 'CATEGORY', a."id",
    'Actualizó la categoría Camillas de Masaje → Camillas para spa y masaje (nombre y descripción; /camilla no cambia)',
    CURRENT_TIMESTAMP,
    jsonb_build_object('name', a."name", 'description', a."description", 'seoDescription', a."seoDescription"),
    jsonb_build_object('name', c."name", 'description', c."description", 'seoDescription', c."seoDescription"),
    'MIGRACION', 'fm96sadl', NULL
FROM "_camillas_antes" a
JOIN "Category" c ON c."id" = a."id" AND c."name" = 'Camillas para spa y masaje'
ON CONFLICT ("id") DO NOTHING;

COMMIT;
