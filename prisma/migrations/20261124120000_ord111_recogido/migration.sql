BEGIN;

-- ORD-111 · SAL-103 (24-nov-2026): quedó en «Pendiente recoger 4 productos» y no deja Entregar. Se despachó de
-- Stock el 19-nov y el 23-nov a las 8:31 a. m. pasó a Fabricación (T-846), una hora antes de que subiera el
-- arreglo que la marca recogida sola (e81a80c). Hace lo mismo que ese arreglo, solo en esta orden:
-- 1) agrega la portada de cada producto como foto de «Recogido» si la línea no tiene foto;
-- 2) a la pieza de $0 del combo sin estado de pago la deja PAID (marcarPagadaAlRecoger: no hay cargo que pagar).
-- No toca dinero, cargos, inventario, la venta ni los despachos. Correrla dos veces no hace nada.
WITH lineas AS (
    SELECT oi."id", oi."orderId", oi."productId"
    FROM "OrderItem" oi
    JOIN "Order" o ON o."id" = oi."orderId"
    WHERE o."code" = 'ORD-00111'
      AND oi."fulfillmentMode" = 'MANUFACTURE'
      AND EXISTS (
          SELECT 1 FROM "DispatchItem" di JOIN "Dispatch" d ON d."id" = di."dispatchId"
          WHERE di."orderItemId" = oi."id" AND d."status" NOT IN ('CANCELLED', 'RETURNED')
      )
),
foto AS (
    INSERT INTO "OrderItemPhoto" ("id", "orderItemId", "url", "name", "createdAt")
    SELECT 'migracion-20261124120000-' || l."id", l."id", portada."url",
           'Recogido automático: ya estaba despachado', CURRENT_TIMESTAMP
    FROM lineas l
    JOIN LATERAL (
        SELECT pi."url" FROM "ProductImage" pi
        WHERE pi."productId" = l."productId" AND pi."tipo" = 'foto'
        ORDER BY pi."order" ASC
        LIMIT 1
    ) portada ON TRUE
    WHERE NOT EXISTS (SELECT 1 FROM "OrderItemPhoto" f WHERE f."orderItemId" = l."id")
    ON CONFLICT ("id") DO NOTHING
    RETURNING "orderItemId"
),
pagada AS (
    UPDATE "OrderItem" oi SET "supplierPaymentStatus" = 'PAID'
    FROM lineas l
    WHERE oi."id" = l."id"
      AND oi."supplierPaymentStatus" IS NULL
      AND COALESCE(oi."purchaseCost", 0) * oi."quantity" = 0
    RETURNING oi."id"
)
INSERT INTO "ActivityLog" ("id", "actorId", "actorName", "action", "entityType", "entityId", "entityCode", "summary", "createdAt", "origin", "ticket", "commitSha")
SELECT 'migracion-20261124120000-ord111', NULL, 'Migración', 'UPDATE', 'ORDER', l."orderId", 'ORD-00111',
       'Marcó recogidos los productos de la ORD-111: ya estaban despachados (' ||
       (SELECT count(*) FROM foto) || ' fotos, ' || (SELECT count(*) FROM pagada) || ' piezas de $0 pagadas)',
       CURRENT_TIMESTAMP, 'MIGRACION', 'ord111-recogido', NULL
FROM lineas l
WHERE EXISTS (SELECT 1 FROM foto) OR EXISTS (SELECT 1 FROM pagada)
LIMIT 1
ON CONFLICT ("id") DO NOTHING;

COMMIT;
