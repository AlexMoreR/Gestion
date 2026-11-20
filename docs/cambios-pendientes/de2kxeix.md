## Reglas de negocio

- `combo_of_al_primer_abono`: al registrar una venta con el Combo Camillas o su primer abono (también la contraentrega guardada sin orden), si la venta aún no tiene orden, Gestión crea sola la orden, el cargo a Laura y la OF (`ensureManufacturingOrders`), y anota en la bitácora "Orden creada sola (Combo Camillas): ORD-xx · OF-xx creada sola por <persona>". Si todas las piezas salen de bodega no hay OF. No le manda nada a Laura.
- `aviso_of_combo`: `planAvisoOF` (`src/modules/ventas/domain/combo-camillas.ts`) decide si la OF del combo se le puede mandar sola a Laura: pieza sin modo (MIXED o vacía) → falta definir; todo de bodega → nada; sin proveedora única confirmada → falta proveedora; teléfono con menos de 7 dígitos → falta teléfono; sin la foto exacta del color (`fotoExactaDelColor`) → falta foto. Se calcula al vuelo (`avisosOFCombo`) y se muestra en `/admin/ventas` y en la OF de la orden; no se guarda.

## Riesgos de operación

- `deuda_laura_al_primer_abono`: en una venta con combo guardada sin abono (y sin orden), la deuda con Laura nace al registrar el primer abono. Si la OF falla al crearse, la orden y la deuda quedan y la OF sale al abrir la orden.
