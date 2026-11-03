## Reglas de negocio

- `compra_por_lote_registro`: en "Registrar compra" (`/admin/ordenes` → Nuevo) cada línea lleva "Pendientes por fabricar" (0 por defecto, entre 0 y la cantidad). El cargo a la proveedora y la línea de la orden van por la cantidad completa (6 × 580.000 = 3.480.000); al inventario solo entra cantidad − pendientes (un combo, repartido en sus piezas). Con pendientes > 0 se crean las filas de `CompraUnidad`: las que entraron en EN_INVENTARIO en Cali y las pendientes en PENDIENTE sin color (`lotUnitsForLine`). La bitácora dice cuántas quedaron pendientes. Con 0 pendientes todo queda como antes.
- `compra_por_lote_sin_editar`: una compra con filas de `CompraUnidad` no se edita con "Editar compra": sale "Esta compra es por lote: se maneja en Inventario → Lotes".

## Riesgos

- `compra_por_lote_sin_transaccion`: el registro de la compra directa no es una sola transacción (ya era así): si falla a mitad, pueden quedar la orden y parte de los movimientos o de las filas de `CompraUnidad`.
