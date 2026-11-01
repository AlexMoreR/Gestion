## Reglas de negocio

- `combo_camillas_orden_sola`: al registrar una venta (desde cotización o directa) que trae el Combo Camillas (CMB005 o CAV-16), se crea sola su orden de venta y cada pieza del combo se confirma con la proveedora Laura al costo de `ProductSupplier.supplierCost` del combo (600.000 por combo, entero en la primera pieza y 0 en las demás). Igual que el botón "Fabricar": guarda `purchaseCost`, crea el cargo en la cuenta de Laura y manda a producción. Bitácora "Orden creada sola (Combo Camillas)". No manda WhatsApp ni correo. Laura se toma de `AppSetting.comboCamillasConfig` (`{ "supplierId": "..." }`) o, si no está, del único fabricante cuyo nombre tiene la palabra "Laura". Caso de uso `src/modules/ventas/application/auto-create-combo-order.ts`.
- `venta_directa_combo_agrupado`: en la venta directa las piezas de un combo ahora guardan `comboKey`, nombre, código y cantidad del combo en la nota (como la cotización); por eso la factura de una venta directa muestra el combo en una sola fila.

## Riesgos de operación

- `combo_camillas_sin_orden`: si falta el costo de Laura, hay dos "Laura", Laura no es proveedora de alguna pieza (incluida una pieza alterna) o algo falla, no se crea nada: la venta se guarda igual sin orden (se ve en el log del servidor y en la alerta de la venta). Si el costo de Laura cambia, cambian la ganancia de Balances y la comisión de esas ventas.
