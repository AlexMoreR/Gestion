## Pantallas

- `/admin/inventario/lotes`: compras por lote a proveedora. Arriba "Cali: N · Taller proveedora: N · Fabricando: N · Pendientes: N"; por lote proveedora, producto, costo por unidad, total y "Pagado X · Saldo Y"; por unidad su estado y los botones Pasar a fabricar (color), Llegó (ubicación), Cambiar ubicación, Editar color y Salió en venta (orden de venta). Solo ADMIN cambia; enlace "Lotes" en `/admin/inventario`.

## Reglas de negocio

- `compra_por_lote_unidades`: "Llegó" pasa la unidad de Fabricando a En inventario y suma 1 al stock (un combo, sus piezas) con el `purchaseCode` de la compra; no crea cargo a la proveedora ni cambia la línea de la orden (la deuda ya se cargó completa). "Salió en venta" es manual y solo marca la unidad; el stock baja al confirmar la pieza en la orden de venta, que debe ir en modo Stock para no cargarle otra vez a la proveedora. Cada acción usa candado sobre la unidad y queda en la bitácora con el código de la compra.

## Riesgos

- `compra_por_lote_venta_manual`: si la venta del lote se hace en modo Fabricación en vez de Stock, se le carga otra vez a la proveedora; y si nadie marca "Salió en venta", la unidad sigue apareciendo en Cali o Taller aunque el stock ya bajó.
