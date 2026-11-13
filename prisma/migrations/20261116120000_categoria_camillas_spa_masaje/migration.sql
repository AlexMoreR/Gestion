BEGIN;

-- fm96sadl (nov-2026): nuevo nombre y descripción de la categoría Camillas (pedido del Agente SEO).
-- Solo toca "name", "description" y "seoDescription" (vaciada para que Google lea la descripción nueva).
-- Nunca el slug: la dirección /camilla no cambia. Solo actúa si el nombre viejo sigue y el nuevo no existe
-- (name es único): correrla dos veces o después de un cambio a mano no hace nada ni rompe el arranque.
UPDATE "Category"
SET "name" = 'Camillas para spa y masaje',
    "description" = 'Camillas para spa, masaje, cosmetología, pestañas y tatuaje. Tenemos 17 modelos de $399.000 a $1.719.000: divanes, portátil, de 2 y 3 cuerpos, curvas para lashista y en madera. Fábrica en Cali y Bogotá, envíos a toda Colombia. Cotiza por WhatsApp.',
    "seoDescription" = NULL,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "name" = 'Camillas de Masaje'
  AND NOT EXISTS (SELECT 1 FROM "Category" WHERE "name" = 'Camillas para spa y masaje');

-- Firma de la migración (convención del repo): su propia línea en la bitácora, solo si quedó el nombre nuevo.
INSERT INTO "ActivityLog" ("id", "actorId", "actorName", "action", "entityType", "entityId", "summary", "createdAt", "origin", "ticket", "commitSha")
SELECT
    'migracion-20261116120000-categoria-camillas', NULL, 'Migración', 'UPDATE', 'CATEGORY', c."id",
    'Categoría "Camillas de Masaje" → "Camillas para spa y masaje", descripción nueva y SEO description vacía (la dirección /camilla no cambia)',
    CURRENT_TIMESTAMP, 'MIGRACION', 'fm96sadl', NULL
FROM "Category" c
WHERE c."name" = 'Camillas para spa y masaje'
ON CONFLICT ("id") DO NOTHING;

COMMIT;
