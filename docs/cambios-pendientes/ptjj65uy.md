## Reglas de negocio

- `orden_sola_combo_camillas`: al registrar una venta (desde cotización o directa) que trae el Combo Camillas (código CMB005 o CAV-16) y aún no tiene orden, Gestión crea sola la orden de venta y confirma las piezas del combo con la proveedora Laura (id en `AppSetting.comboCamillasConfig` `{ "supplierId": "..." }`; si no está, la única fábrica cuyo nombre diga "Laura") al costo de Laura para el combo (`ProductSupplier.supplierCost`, ej. 600.000), una sola vez por combo. Igual que el botón "Fabricar": guarda `purchaseCost`, crea el cargo en la cuenta de Laura y el trabajo de producción. Bitácora "Orden creada sola (Combo Camillas)". No le escribe a nadie. Piezas por stock no se confirman. Código: `src/modules/ventas/application/auto-create-combo-order.ts` y `costosItemsCombo` en `src/modules/ventas/domain/combo-camillas.ts`.

## Riesgos de operación

- `orden_sola_combo_camillas_falla`: si falta Laura, hay dos "Laura", falta su costo o los combos tienen costos distintos, no se crea nada y la venta queda sin orden (la alerta del combo lo muestra); si falla a mitad, se deshace todo. El costo que se usa es el que esté cargado en el catálogo para Laura: si está mal, el cargo y la ganancia quedan mal.
