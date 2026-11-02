## Reglas de negocio

- `costo_salida_stock`: al confirmar una pieza por stock (una sola o en lote) el costo que se guarda en la línea (`purchaseCost`) es lo que cobró la proveedora en la compra que entró esas unidades, sin el flete del producto: lo que queda en bodega son las unidades más nuevas y sale la más vieja de ese bloque. La compra se lee de la orden de compra (ORD-) o, si se entró sin orden, del cargo INV- ligado a la entrada; si no hay compra, va el costo de catálogo (costo base + flete). De dónde salió queda en `OrderItem.stockCostSource` (p. ej. "ORD-00092" o "catálogo") y se borra al anular la confirmación. Lógica en `src/lib/stock-exit-cost.ts` + `src/modules/inventory/domain/fifo-cost.ts`.

## Riesgos de operación

- `costo_salida_stock_no_se_recalcula`: el costo queda fijo al confirmar. Si después se edita el costo de la compra, las piezas ya confirmadas no cambian (hay que anular y volver a confirmar).
