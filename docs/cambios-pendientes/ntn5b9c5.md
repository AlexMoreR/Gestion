## Riesgos de operación

- `reversa_no_recalcula_dinero`: deshacer la entrega o el despacho de un producto no cambia `Order.status`, Balances, fletes ni comisiones. En una venta contraentrega ya entregada (cuenta en Balances) con productos reversados, el detalle de la orden y la fila de la venta muestran un aviso; ajustar el dinero lo decide administración a mano.
