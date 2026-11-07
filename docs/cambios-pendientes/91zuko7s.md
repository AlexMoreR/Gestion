## Reglas de negocio

- `fecha_fabricacion_al_confirmar`: en `/admin/ordenes/<id>` de una venta, **Fabricar → Confirmar compra** y **Confirmar N → Confirmar productos** (con productos de fabricación) exigen la "Fecha de entrega de fabricación" (hoy o después; atajos +7, +10 y +15 días). El servidor la valida antes de confirmar (sin ella no se crea el cargo a la proveedora) y la guarda en la OF de cada proveedora (`deliveryDate` y `estimatedDeliveryAt` a las 5:00 p. m. Colombia), la misma que edita la pestaña Fabricación y ve la proveedora en `/fabricacion/<token>`; el cambio queda en "Historial de fechas". La OF solo tiene una fecha: confirmar otro producto con otra fecha cambia toda la OF. Las compras, los productos de stock y la orden automática del Combo Camillas no la piden. Lógica en `fechaFabricacionDeDia` (`src/lib/delivery-tracking.ts`) y `fijarFechaFabricacion`/`proveedorasDelLote` (`src/lib/manufacturing-orders.ts`).

## Riesgos de operación

- `fecha_fabricacion_no_guardada`: la compra se confirma primero y la fecha se guarda justo después; si eso falla, la compra queda confirmada y sale "Compra confirmada, pero no se pudo guardar la fecha: ponla en la pestaña Fabricación" (la OF queda sin fecha y no se puede enviar hasta ponerla). Un cambio de fecha de una OF ya enviada no se le avisa sola a la proveedora.
