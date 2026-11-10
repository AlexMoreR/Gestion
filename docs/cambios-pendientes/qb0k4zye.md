## Pantallas

- `registrar_devolucion`: en `/admin/ordenes/[orderId]`, botón **Registrar devolución** (acción `adminRegisterOrderReturnAction` en `src/app/actions/order-return-actions.ts`, permiso de Despachos u Órdenes). Guarda `OrderReturn` con sus productos y evidencias (fotos o PDF en `public/uploads/returns`, tipo validado por sus bytes). Efecto según `efectoDeRegistrar`: En camino y vuelve todo → despacho a Devuelto + guía sincronizada; Entregado → `deliveryReversedAt` en las líneas completas + `OrderItemReversal` RECHAZADO; lo demás, solo el registro. La orden no cambia. Nunca toca dinero ni inventario.
- `tarjeta_devoluciones`: tarjeta **Devoluciones** de solo lectura en el detalle de la orden, con la «Pérdida logística (informativa)» de `perdidaDevolucion`.

## Reglas de negocio

- `estado_devolucion_orden`: `estadoDevolucionDeOrden` (`src/lib/order-return.ts`) decide la etiqueta del detalle: Devuelta (abiertas cubren toda la orden), Devolución parcial o Devuelta – falta registrar (despacho Devuelto sin devolución registrada cuyos productos no volvieron a salir).
- `aviso_dinero_devoluciones`: `reversalMoneyWarning` cuenta también las devoluciones abiertas (`openReturns`) en una contraentrega cerrada; sin ellas el texto es el mismo de antes.

## Lo que no tiene

- `devolucion_sin_cerrar_anular`: aún no se cierran ni anulan devoluciones, la lista `/admin/ordenes` no muestra la etiqueta ni hay vista «Devueltas», y **Registrar entrega** / «Deshacer entrega» siguen disponibles con una devolución abierta (partes siguientes).

## Riesgos

- `devolucion_archivos_huerfanos`: si la transacción falla después de subir las evidencias, los archivos quedan en `public/uploads/returns` sin uso.
- `devolucion_ordenes_viejas`: órdenes con un despacho Devuelto sin reenviar mostrarán de golpe «Devuelta – falta registrar».
