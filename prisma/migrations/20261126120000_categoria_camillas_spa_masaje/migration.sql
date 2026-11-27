BEGIN;

-- q18h29nd (nov-2026, reemplaza T-180): nuevo nombre y descripción de la categoría Camillas, sin cantidades
-- ni precios para no tener que corregirla cada vez que cambie el catálogo.
-- Solo toca "name", "description" y "seoDescription" (vaciada para que Google lea la descripción nueva).
-- Nunca la dirección: /camilla no cambia. Solo actúa si el nombre viejo sigue y el nuevo no existe
-- (name es único): correrla dos veces o después de un cambio a mano no hace nada ni rompe el arranque.
UPDATE "Category"
SET "name" = 'Camillas para spa y masaje',
    "description" = 'Camillas para spa, masaje, cosmetología, pestañas y tatuaje: divanes, portátiles, hidráulicas, de dos y tres cuerpos, curvas para lashista y en madera. Fábrica en Cali y Bogotá, envíos a toda Colombia. Cotiza por WhatsApp.',
    "seoDescription" = NULL,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "name" = 'Camillas de Masaje'
  AND NOT EXISTS (SELECT 1 FROM "Category" WHERE "name" = 'Camillas para spa y masaje');

-- Firma de la migración (convención del repo): su propia línea en la bitácora, solo si quedó el nombre nuevo.
INSERT INTO "ActivityLog" ("id", "actorId", "actorName", "action", "entityType", "entityId", "summary", "createdAt", "origin", "ticket", "commitSha")
SELECT
    'migracion-20261126120000-categoria-camillas', NULL, 'Migración', 'UPDATE', 'CATEGORY', c."id",
    'Categoría "Camillas de Masaje" → "Camillas para spa y masaje", descripción nueva sin cantidades ni precios y SEO description vacía (la dirección /camilla no cambia)',
    CURRENT_TIMESTAMP, 'MIGRACION', 'q18h29nd', NULL
FROM "Category" c
WHERE c."name" = 'Camillas para spa y masaje'
ON CONFLICT ("id") DO NOTHING;

COMMIT;
