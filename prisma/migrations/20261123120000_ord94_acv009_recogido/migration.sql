BEGIN;

-- Tarjeta 2fn86qx8 (nov-2026): ORD-94 · SAL-86 quedó en «Pendiente recoger 1 producto» porque el carrito
-- ACV009 pasó de Stock a Fabricación ya despachado y la regla de «Recogido» pide una foto del producto
-- terminado. Solo AGREGA esa foto (la portada de ACV009) si la línea aún no tiene ninguna; no toca dinero,
-- inventario, la venta ni el estado de pago. Correrla dos veces no hace nada (NOT EXISTS + ids fijos).
-- La firma en la bitácora sale solo si de verdad se agregó la foto.
WITH foto AS (
    INSERT INTO "OrderItemPhoto" ("id", "orderItemId", "url", "name", "createdAt")
    SELECT 'migracion-20261123120000-' || oi."id", oi."id", portada."url",
           'Recogido automático: ya estaba despachado', CURRENT_TIMESTAMP
    FROM "OrderItem" oi
    JOIN "Order" o ON o."id" = oi."orderId"
    JOIN "Product" p ON p."id" = oi."productId"
    JOIN LATERAL (
        SELECT pi."url" FROM "ProductImage" pi
        WHERE pi."productId" = p."id" AND pi."tipo" = 'foto'
        ORDER BY pi."order" ASC
        LIMIT 1
    ) portada ON TRUE
    WHERE o."code" = 'ORD-00094'
      AND p."code" = 'ACV009'
      AND oi."fulfillmentMode" = 'MANUFACTURE'
      AND NOT EXISTS (SELECT 1 FROM "OrderItemPhoto" f WHERE f."orderItemId" = oi."id")
    ON CONFLICT ("id") DO NOTHING
    RETURNING "orderItemId"
)
INSERT INTO "ActivityLog" ("id", "actorId", "actorName", "action", "entityType", "entityId", "entityCode", "summary", "createdAt", "origin", "ticket", "commitSha")
SELECT 'migracion-20261123120000-ord94-acv009', NULL, 'Migración', 'UPDATE', 'ORDER', oi."orderId", 'ORD-00094',
       'Marcó recogido ACV009: ya estaba despachado', CURRENT_TIMESTAMP, 'MIGRACION', '2fn86qx8', NULL
FROM foto
JOIN "OrderItem" oi ON oi."id" = foto."orderItemId"
LIMIT 1
ON CONFLICT ("id") DO NOTHING;

COMMIT;
