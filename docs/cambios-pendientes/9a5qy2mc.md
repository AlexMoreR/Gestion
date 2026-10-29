## Reglas de negocio

- `entrega_parcial`: en una orden se puede "Separar unidades" de un producto (ej. Diván ×2 → ×1 + ×1, mismo precio, costo, proveedor y modo) para despachar, entregar o devolver a stock solo una parte. La orden queda "Entregada" (COMPLETED) solo cuando cada unidad está en un despacho entregado; si falta algo queda "Despachada" con la nota "Entrega parcial". Una venta contraentrega entregada por partes cuenta en Balances y comisiones cuando se entrega la última parte. No se separa con orden cancelada o entregada, producto ya despachado o con trabajos de producción.

## Riesgos de operación

- `entrega_parcial_olvidada`: si se entrega una parte y se olvida el resto, la orden no se cierra y la venta contraentrega no cuenta hasta cerrarla. Los cargos al proveedor quedan en la primera línea al separar.
