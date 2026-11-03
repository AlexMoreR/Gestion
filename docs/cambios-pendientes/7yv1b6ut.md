## Entidades

- `OrderItemReversal`: cada reversa de una entrega o un despacho con su motivo de la lista (clave, texto si es "Otro", comentario opcional), estado de antes y de después, quién y cuándo. Hoy la crea «Deshacer entrega» de la orden (toda la orden, de ENTREGADO a DESPACHADO). Se borra con la orden; si se quita el despacho o la línea, queda sin ellos. Mientras un usuario tenga reversas no se puede borrar ese usuario.
- `DispatchItem.deliveryReversedAt`: columna nueva, vacía en todo lo que existe; un producto está Entregado solo si su despacho está DELIVERED y esta columna está vacía (la usará la reversa por producto).

## Pantallas

- `/admin/ordenes/[orderId]`: «¿No se entregó? Deshacer entrega» ahora pide el motivo (8 opciones; con «Otro» hay que escribir cuál) y un comentario opcional; «Sí, deshacer entrega» queda apagado hasta elegir el motivo.
