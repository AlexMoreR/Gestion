-- Italo Eco (LCF003) y CAMILLA DIVAN + SILLA AUXILIAR (CMB001) tenian minimo al por mayor de 1:
-- la tienda mostraba el precio por mayor desde 1 unidad. Lo detecto la rutina Revisor el 18-oct-2026
-- y Alexander lo verifico el 27-oct-2026. Se les pone 3, el minimo de casi todo el catalogo.
-- Solo cambia ese dato (no precios) y solo si sigue en 1 o menos: si ya se corrigio a mano no hace nada.
UPDATE "Product"
SET "minWholesaleQty" = 3, "updatedAt" = NOW()
WHERE "code" IN ('LCF003', 'CMB001') AND "minWholesaleQty" <= 1;
