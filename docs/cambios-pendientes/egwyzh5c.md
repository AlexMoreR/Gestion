## Reglas de negocio

- `cambio_color_venta_activa`: en una venta no cancelada, **Cambiar color** (detalle de la orden, solo con acceso a Órdenes) cambia solo el color de un producto, con motivo obligatorio (3 letras o más). Cambia la nota de la línea de la cotización y de sus líneas de la orden (en un combo, todas sus piezas); así la factura, la cotización, la orden y la OF muestran el color nuevo. Deja una nota en la orden ("Cambio de color de …: viejo → nuevo. Motivo: …") y una entrada en la bitácora con el antes. No cambia precios, totales, abonos, costos, estados ni fechas, y no usa el historial de estados.

## Riesgos de operación

- `cambio_color_sin_aviso`: el cambio de color no avisa a nadie. Si la OF ya se le mandó a la proveedora, ella ve el color nuevo al volver a abrir el enlace, pero hay que decírselo a mano. El recibo de caja ya enviado al CRM no cambia (nunca tuvo color). Una pieza de combo sin desglosar se encuentra por el texto "Combo: <nombre>"; si alguien editó ese texto a mano, esa pieza puede quedar con el color viejo.
