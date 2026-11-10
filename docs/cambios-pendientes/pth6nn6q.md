## Pantallas

- `vida_devolucion`: en la tarjeta **Devoluciones** de `/admin/ordenes/[orderId]`, una devolución abierta trae **Editar** (`adminEditOrderReturnAction`: motivo, dónde está, qué sigue, comentario, flete de vuelta y agregar evidencias; bitácora con antes y después de lo que cambió, `cambiosDeDevolucion`), **Cerrar devolución** (`adminCloseOrderReturnAction`: solo `closedAt`) y **Anular** (`adminAnnulOrderReturnAction`: motivo ≥ 3 letras en `annulReason`, la fila se conserva). Todo en `src/app/actions/order-return-actions.ts`.
- `aviso_asesora_devolucion`: recuadro ámbar con **Avisar a <asesora> por WhatsApp** (wa.me manual, `mensajeDevolucionAsesora`, sin precios ni fletes) y **Ya avisé** (`adminMarkReturnSellerNotifiedAction`: `sellerNotifiedAt` + `sellerNotifiedById`). Asesora = `sale.quote.createdBy`; celular de `User.phone` o `TeamMember.phone`. Nada se manda solo.
- `historial_devolucion`: al pie de cada devolución, las entradas de `ActivityLog` de la orden con `after.devolucion` = su id.

## Reglas de negocio

- `anular_devolucion`: `efectoDeAnular` (`src/lib/order-return.ts`). Solo abiertas. Si esa devolución pasó el despacho de SHIPPED a RETURNED → el despacho vuelve a SHIPPED y la guía a su último estado en camino (directo en la transacción: `syncShipmentFromDispatch` no saca una guía de Devuelta, que es final); con otro despacho vivo de esos productos se rechaza. Si estaba entregado → limpia `deliveryReversedAt` de las líneas que marcó y crea una `OrderItemReversal` ERROR ("Anuló la devolución: <motivo>"). No toca dinero, inventario ni la orden.

## Riesgos

- `anular_reversa_por_tiempo`: la reversa «de la devolución» se reconoce por su texto, autor y el mismo minuto del registro (no hay columna que las ligue). Si después alguien hizo «Deshacer entrega» a mano sobre el mismo producto, ese producto no se toca al anular y el mensaje lo dice.
