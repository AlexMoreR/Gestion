## Reglas de negocio

- `descuento_venta_creada`: en `/admin/ventas`, menú "⋯" → **Aplicar descuento** (admin con permiso de ventas/cotizaciones, `adminApplySaleDiscountAction`): monto + motivo (≥ 3 letras). Baja `Sale.total` y `Order.total`, suma a `Sale.discountAmount` (llena `grossTotal` si estaba en 0), recalcula el estado con lo abonado (`saleStatusForPaid`), nota en la orden y `ActivityLog` con total antes/después. Nunca pasa del saldo pendiente (no deja saldo a favor); no en venta u orden anulada. La cotización no cambia. Ganancia y comisión bajan solas (leen `Sale.total`). Regla pura en `src/modules/ventas/domain/sale-discount.ts`. El recibo `/sales/<token>` ahora resta `discountAmount` del total de productos y muestra la línea "Descuento".

## Riesgos de operación

- `descuento_sin_deshacer`: un descuento puesto por error no tiene botón para deshacerlo; si la venta ya contaba en un mes anterior, cambian la ganancia y la comisión de ese mes (un cierre ya guardado no se rehace). Orden en una contraentrega: primero el descuento, después el abono final.
