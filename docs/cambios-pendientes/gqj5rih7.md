## Reglas de negocio

- `flete_pagado_al_despachar`: para despachar (un producto o varios) cada tramo de envío con valor exige la cuenta de donde salió la plata y el comprobante (salvo cuenta de efectivo, igual que Gastos). Se registra como pago al transportador en su cuenta corriente (cargo + pago, con cuenta y comprobante); ese pago es lo único que resta del saldo de la cuenta. El costo de envío de la venta (`ShippingCost.supplierPaymentId`) queda enlazado al pago y sin cuenta propia, para no restar dos veces. Ya no existe "pagar luego".
- `tramos_de_envio_pagados`: con varios transportadores, un pago por tramo (valor, cuenta y comprobante). Para despachar basta el primer tramo; en el recuadro Envío de la orden, "Agregar tramo" suma otro tramo pagado (se suma al flete, se reparte entre los productos y, en compras, al total de la orden).
- `marcar_despachada_exige_despacho`: "Marcar despachada" del menú de la orden no deja pasar a DESPACHADO si la orden no tiene un despacho creado.

## Pantallas

- `/admin/balances/fletes-sin-cuenta`: fletes viejos sin cuenta ni pago enlazado. Junto a cada uno muestra los pagos de Proveedores del mismo transportador y la misma venta (con cuenta y sin enlazar). Acciones a mano: "Ya está pagado en Proveedores" (enlaza, no cambia saldos) o "Asignar cuenta" a uno o varios (pasa a restar de esa cuenta). Todo queda en la bitácora. Se entra desde "Asignar cuenta a los fletes" del aviso amarillo de Dinero hoy.

## Riesgos de operación

- `flete_viejo_doble_resta`: asignarle cuenta a un flete viejo que en verdad ya se pagó en Proveedores lo resta dos veces; por eso la pantalla muestra los posibles pagos al lado, pero depende de que la persona elija bien.
- `deshacer_despacho_borra_pago`: "Deshacer despacho" borra los pagos y costos de flete de ese despacho; el saldo de la cuenta vuelve a subir aunque la plata ya haya salido. Si se rehace el despacho, se vuelve a registrar el pago.
- `flete_en_cero`: un envío con valor 0 no exige pago; si después se cobra, se registra con "Agregar tramo".
