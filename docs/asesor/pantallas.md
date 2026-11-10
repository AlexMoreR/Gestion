# Manual de pantallas de Gestión

Para que Claude sepa dónde está cada botón del panel (`/admin`). Los textos en **negrita** son los del
botón o campo tal como aparecen en la pantalla (algunos no llevan tilde en la app, como "Nueva cotizacion").
Los botones que solo tienen ícono se describen por lo que hacen (por ejemplo, el menú "⋯" de cada fila).
Este manual no cambia nada de la app: si una pantalla cambia, hay que actualizarlo.

## Tareas del día a día

### 1. Registrar un abono a una venta
1. `/admin/ventas` → buscar la venta (buscador o filtros).
2. Menú "⋯" de la fila → **Registrar abono**.
3. En la hoja: fecha, **Monto del abono**, **Cuenta de balance**, comprobante (obligatorio si la cuenta no es de efectivo) y **Nota**.
4. **Guardar abono**. Si la fecha es anterior a hoy, pide el motivo. Si la venta dice **Venta saldada**, ya no tiene saldo.

### 2. Pagar a una proveedora
1. `/admin/proveedores` → menú "⋯" de la fila → **Transacciones** (o clic en la fila): abre `/admin/proveedores/<id>/cuenta`.
2. Botón de menú "Acciones" → **Registrar movimiento**.
3. Subir la **Foto** del comprobante, fecha, **Cuenta** y referencia.
4. **Agregar línea** → elegir la orden o cargo (o abono general) y el monto → **Guardar línea**.
5. **Registrar pago** (no se activa sin foto, cuenta y monto).
- La orden (`/admin/ordenes/<id>`) no tiene botón para pagar: en la pestaña **Fabricación** solo se ve lo pagado y lo que falta.
- Por Claude: herramienta MCP `registrar_pago_proveedora` (dos pasos: resumen y "sí"). Nunca como gasto: contaría el costo dos veces.

### 3. Despachar y registrar el flete (también con varios tramos)
1. `/admin/ordenes/<id>` → en el producto, **Recoger** → subir la foto → **Marcar como recogido**.
2. **Despachar** → Modalidad "Transportadora", la transportadora y el costo de envío (gasto de la venta).
3. Elegir la cuenta de donde salió el pago y subir el comprobante → **Despachar producto**.
- Varios productos a la vez: marcar las casillas → "Despachar N" → **Despachar productos**.
- Varios tramos (ej. llegada a Cali con un transportador y despacho al cliente con otro): en el mismo modal, en "Otros proveedores de envio", **Agregar** por cada tramo. Después de despachar: en el recuadro "Envío" de la orden, **Agregar tramo** → **Guardar tramo pagado**.
- `/admin/despachos` no crea despachos ni registra el flete: solo cambia el estado y reparte el flete entre productos.

### 4. Movimiento manual de cuenta: entrada, salida o transferencia
1. `/admin/configuracion/cuentas` → **Movimiento**.
2. Tipo: `Ingreso manual` (entrada), `Retiro / salida manual` (salida) o `Traslado entre cuentas` (transferencia: **Cuenta origen** y **Cuenta destino**).
3. Fecha, monto y nota → **Registrar movimiento**.
- En `/admin/balances` no hay botón de movimiento: ahí solo se edita una cuenta.

### 5. Registrar un gasto (en pantalla y por voz)
- En pantalla: `/admin/gastos` → pestaña **Gastos** → **Nuevo gasto** → foto (si la cuenta no es efectivo), monto, fecha, **Categoria**, cuenta (y **Empleado** si es nómina), descripción → **Registrar gasto**.
- Por voz o chat: herramienta MCP `registrar_gasto`. Paso 1 con `confirmado=false`: Claude repite el resumen y pregunta "¿Lo guardo?". Paso 2, solo con el "sí", UNA vez con `confirmado=true`: el gasto queda guardado y llega un enlace opcional (24 h) para subir la foto. Nómina exige persona; fecha anterior a hoy exige motivo.
- En la pestaña Gastos de Balances no se crean gastos.

### 6. Crear una cotización y pasarla a venta
1. `/admin/cotizaciones` → **Nueva cotizacion**.
2. Paso 1: **Agregar producto** (buscar y elegir **Tipo de venta**) → **Agregar producto** → **Siguiente**.
3. Paso 2: **Agregar cliente** → **Siguiente**.
4. Paso 3: **Generar cotizacion** (si un combo o producto con partes no tiene color, sale "Falta escoger el color: …" y no guarda).
5. En la lista, menú "⋯" de esa cotización → **Enviar a ventas** → forma de pago (obligatoria: 50/50, Pago total o Contraentrega) y descuento opcional → **Agregar abono** (monto, cuenta y comprobante → **Listo**) → **Enviar a ventas**. Exige al menos un abono y el comprobante (foto o PDF) de cada abono, también en efectivo; si falta algo el botón queda apagado y dice qué falta.
6. Luego la fila muestra **Ver venta**. "Enviar a ventas" no está dentro de la pantalla de edición de la cotización.

### 7. Crear una orden de fabricación (OF)
1. Primero la orden de venta: `/admin/ventas` → menú de la fila → **Crear orden** (luego **Ver orden**).
2. En `/admin/ordenes/<id>`, en el producto → **Fabricar** → elegir el proveedor, el costo de compra y la **Fecha de entrega de fabricación** (obligatoria; atajos **+7 días**, **+10 días**, **+15 días**) → **Confirmar compra**. La OF de esa proveedora se crea sola con esa fecha. El cuadro se cierra y el producto queda en "Fabricando"; **Recoger** se pulsa en la fila cuando el producto esté listo.
3. Pestaña **Fabricación** → fecha y hora estimada de entrega (obligatoria), dirección y notas → **Guardar datos de entrega**.
4. Mandarle el enlace a la proveedora: **Enviar por WhatsApp** o **Copiar enlace** (**Ver** lo abre).
- Varios productos a la vez: marcar las casillas → "Confirmar N" → elegir la **Fecha de entrega de fabricación** (si hay productos de fabricación) → **Confirmar productos** (usa la proveedora sugerida). El cuadro se cierra, las casillas quedan limpias y **Recoger** se pulsa cuando cada producto esté listo.

### 8. Marcar un producto como combo
1. `/admin/productos` → **Nuevo producto** (o menú "⋯" → **Editar**, o `/admin/productos/<id>`).
2. Paso **Producto** → marcar **Habilitar combo (se arma con otros productos)**.
3. **Agregar componente** por cada pieza (producto y cantidad; alternas opcionales).
4. **Siguiente** hasta el final → **Guardar producto** (nuevo) o **Guardar cambios** (edición).

### 9. Ver la nómina
1. `/admin/comisiones/nomina` (o `/admin/comisiones` → **Nómina y pagos**). Cambiar de mes con las flechas o el selector y **Ver**.
2. Para pagar: en la persona → **Registrar pago** → valor, concepto, **Sale de la cuenta**, fecha y comprobante → **Registrar pago** (queda como gasto de Nómina).

### 10. Ver las comisiones
1. `/admin/comisiones` → tabla **Resumen por asesora** y el detalle por asesora.
2. Mes con las flechas o el selector y **Ver**, o **Mes actual**.

## /admin/ventas
Lista de ventas (código `SAL-...`): cobrar abonos, ver recibo, crear la orden y editar fecha o forma de pago.

**Qué se ve:** barra "Origen:" con chips (**Todos** y uno por origen) y enlaces **Reporte por origen** (`/admin/ventas/origen`) y **Retenciones** (`/admin/ventas/retenciones`). Tarjetas Ventas / Cobrar / Abonos / Saldo (sin las ventas anuladas). Tabla con columnas Venta, Cliente, Estado, Total, Abono, Fecha y el menú "⋯" (aria-label "Acciones <código>"). Filtros: estado (**Todos los estados**, Borrador, Cobrar, Facturada, Finalizada, Anulada), "Rango de fechas" (por defecto el mes actual; las ventas con saldo pendiente se ven siempre) y buscador "Buscar por venta, cliente o estado" (busca en todas las ventas). Estado "Falta entregar" = pagada sin entregar. En una venta contraentrega ya entregada con productos reversados, la celda Estado muestra el aviso ámbar "Esta venta ya cuenta en Balances y tiene N producto(s) reversado(s). El dinero, los fletes y las comisiones no se recalculan solos: administración decide" (solo informa).

**Botones y acciones:**
- **Venta directa** (arriba a la derecha): abre el modal "Venta directa" con fecha arriba. Cliente: Consumidor final / Cliente existente / Nuevo cliente (Nombre y apellido *, teléfono, dirección, Documento (opcional), Correo (opcional)). **Agregar producto** abre un buscador ("Buscar codigo o producto") con Precio de venta y Descripcion; se confirma con **Agregar producto**. Selector "Forma de pago". Casilla **Registrar un abono ahora** (Monto del abono, Cuenta de balance, Comprobante —obligatorio si la cuenta no es de efectivo—, Nota (opcional)). **Cancelar** / **Crear venta**.
- Menú "⋯" de cada fila:
  - **Registrar abono** (sale **Venta saldada** y desactivado si no hay saldo o está cancelada): abre la hoja lateral "Registrar abono".
  - **Ver recibo**: abre `/sales/<token>` (recibo público).
  - **Ver orden** (si ya tiene orden) o **Crear orden** (crea la orden de venta).
  - **Editar fecha**: diálogo "Editar fecha de la venta" (Fecha de la venta, casilla "Alinear también la orden, cobros y cargos a proveedores"); **Cancelar** / **Guardar**. Si la fecha es anterior a hoy pide el motivo (retroactivo).
  - **Cambiar forma de pago**: diálogo "Forma de pago" con el selector (sin "Sin definir"; aviso "Escoge la forma de pago") (50 % anticipo + 50 % al terminar… / Contraentrega (solo combo de camilla…)); **Cancelar** / **Guardar**.
  - **Ver comprobantes** (o **Sin comprobantes**): hoja "Comprobantes de pago" con cada "Abono #n"; botón **Anular** en cada abono: abre "Anular abono" con el campo **Motivo** (obligatorio, mínimo 3 letras) → **Anular abono** / **Volver**.
  - **Anular venta**: ventanita "Anular venta" con el campo **Motivo** (obligatorio) y botones **Volver** / **Anular venta**. La venta queda "Anulada" y su orden "Cancelada" con el motivo; no borra abonos, fletes, despachos ni pagos a proveedores.
  - **Borrar definitivamente** (solo lo ve el dueño): ventanita "Borrar venta definitivamente" con **Motivo** y botones **Volver** / **Borrar definitivamente**; borra la venta con su orden, despachos, abonos y pagos/cargos a proveedores y deja una copia en Actividad.
- Hoja **Registrar abono**: fecha del abono arriba (si es anterior a hoy pide motivo), muestra Total venta y Saldo pendiente; campos **Monto del abono** (máximo = saldo), **Cuenta de balance** (cuentas activas + opción "Retención en la fuente", que pide "N.º de certificado de retención" opcional y no pide comprobante), Comprobante (botón "Archivo"), **Nota**. Botón **Guardar abono**. Abajo, "Abonos registrados" con el botón **Anular** en cada uno (pide motivo, igual que en Ver comprobantes) y, si el recibo de caja ya se intentó mandar al CRM, la etiqueta verde **Recibo enviado** o ámbar **Recibo no enviado**.

## /admin/cotizaciones
Lista de cotizaciones (código `COT-...`): crear, editar, abrir el enlace público y pasarlas a venta.

**Qué se ve:** franja con íconos Cotizaciones / Valor total / Aceptadas / Valor aceptado. Tabla con columnas Cotizacion, Cliente, Asesora (quien creó la cotización), Estado, Total, Fecha y menú "⋯". Buscador "Buscar por código o cliente". Filtro por estado (menú "Filtrar por estado" con casillas Revisión, Enviada, Aceptada, Rechazada, Expirada; por defecto Revisión, Enviada y Expirada).

**Botones y acciones:**
- **Nueva cotizacion**: abre el asistente de 3 pasos:
  - Paso 1 **Productos**: casilla **Precios al por mayor**; **Agregar producto** abre buscador ("Buscar codigo o producto") con Color (lista de la carta de colores del CRM agrupada por material —Cuerotex, Prana, Corsos, Telas— con muestra, código y nombre; al escoger uno se guarda "CÓDIGO · Nombre (Material)" y en las tablas se ve así; el enlace **Escribir otro color** deja escribirlo a mano y **Escoger de la carta** vuelve a la lista; si el CRM no responde sale "No se pudo leer la carta del CRM" con la última copia guardada o, si no hay, solo el campo a mano). Si el producto (o el combo) tiene partes de color, en vez de "Color" sale **Color por parte**: un desplegable por parte (ej. Tapizado con los colores de la carta, los comunes primero; Estructura con sus acabados), con **Por definir** elegido de entrada y válido para guardar; si la opción tiene recargo sale el aviso ámbar "Prana: +$150.000 — ajusta el precio a mano" (no cambia el precio ni el total: se ajusta a mano). En la tabla de productos, debajo de cada línea con partes quedan los mismos desplegables para cambiarlos después (en un combo, para todas sus piezas). Debajo de los desplegables sale la **vista previa con colores** (la foto de portada pintada con lo elegido, unos segundos después de cambiar un color) o "Sin vista previa de color" si falta una máscara, un color o alguna parte está en Por definir. Al guardar la cotización esa imagen queda en la línea: el cliente la ve en el link y en el PDF con el texto "Tapizado: Crema · Base: Dorada" debajo del nombre (o "Sin vista previa de color"), y la proveedora la ve arriba en su OF (`/of/<código>`) con el texto de cada parte debajo. **Tipo de venta** ("Por stock (de existencias)" solo si hay stock / "Por orden (se fabrica)"), Descuento, Costo adicional, foto opcional y Descripcion; **Cancelar** / **Agregar producto**. Cada fila de la tabla tiene **Editar** (lápiz) para cambiarla sin borrarla: ver `/admin/cotizaciones/[quoteId]`. Si el producto parece combo y no tiene sus piezas, aviso ámbar "Este combo no tiene sus piezas cargadas: avisa a quien carga el catálogo." (no bloquea). Luego **Siguiente**.
  - Paso 2 **Cliente**: **Agregar cliente** (o **Editar cliente**) muestra Nombre y apellido (sugiere clientes existentes al escribir), documento, correo, teléfono, dirección, barrio, departamento, ciudad. **Atras** / **Siguiente** (guarda el cliente).
  - Paso 3 **Generar**: Notas y resumen. **Atras** / **Generar cotizacion** (en edición, **Guardar cambios**). Si un combo o un producto con partes de color no tiene color (vacío o en **Por definir**), no guarda y sale en rojo "Falta escoger el color: CMB005 – Tapizado, …"; se escoge el color en el Paso 1 y se vuelve a tocar el botón.
  - **En celular** (menos de 640 px) el asistente ocupa toda la pantalla: arriba quedan quietos el título, el botón Cerrar, la Fecha y los 3 pasos en una fila; los botones **Atras**, **Siguiente** y **Generar cotizacion** quedan siempre abajo, junto con el aviso rojo de colores o del cliente. En celular y tableta (menos de 1024 px) los productos de los pasos 1 y 3 se ven como **tarjetas** (foto, nombre, código, tipo, descripción, color, cantidad, precio y total) en vez de tabla; en el paso 1 cada tarjeta trae **Editar** (lápiz) y borrar (papelera), y debajo los desplegables de color por parte si los tiene.
- En el enlace público `/cotizaciones/<token>` y en su PDF, la columna **Descripción** muestra el color de cada producto: la miniatura de la muestra y "CÓDIGO · Nombre (Material)" (escrito a mano: solo el texto; con partes, una línea por parte "Tapizado: …"; en un combo con piezas de colores distintos, "Camilla: …", "Butaco: …"). Sin color sale "Color por confirmar".
- Menú "⋯" de cada fila:
  - **Abrir**: abre `/cotizaciones/<token>` (enlace público) en otra pestaña.
  - **Editar**: va a `/admin/cotizaciones/<id>`.
  - **Enviar a ventas** (si aún no tiene venta) o **Ver venta** (va a `/admin/ventas?q=<código>`).
  - **Eliminar**: diálogo "Eliminar cotizacion" con **Cancelar** / **Eliminar**.
- Panel **Enviar a ventas**: muestra Total, campo Descuento, Abonos y Restante; selector "Forma de pago" obligatorio ("Escoge la forma de pago"; solo 50/50, **Pago total (100 % por adelantado; envío gratis en ciudades principales)** o Contraentrega, ya no "Sin definir"). Con Pago total los abonos deben sumar el 100 % del total con el descuento ya restado; si no, el recuadro rojo dice "Con Pago total los abonos deben sumar el 100 % del total ($X). Faltan $Y." y **Enviar a ventas** queda apagado. Exige **al menos un abono** ("Agrega al menos un abono."): botón **Agregar abono** (luego **Agregar otro**). Cada abono abre "Detalle del abono": fecha, Monto, Metodo (la cuenta; "Seleccionar metodo"), comprobante (obligatorio siempre, también en efectivo: "Requerido: foto o PDF del pago (también en efectivo)."), Nota ("Ej: Abono 1 de 3"); **Listo**. Si falta algo, el recuadro rojo dice "Falta escoger la forma de pago (50/50, Pago total o Contraentrega)." o "Falta subir el comprobante del primer pago (foto o PDF)." y **Enviar a ventas** queda apagado. Si un abono tiene fecha anterior a hoy pide motivo. Si la cotización tiene color por parte sale la casilla obligatoria **Cliente aprobó colores**; sin marcarla no se envía ("Marca «Cliente aprobó colores» para pasar a venta."), y si una parte quedó en Por definir (o una cotización vieja de un producto con partes no las tiene) se rechaza con "Falta elegir color: CMB005 – Tapizado. Edita la cotización y elige los colores." Al aprobar, quedan fecha, quién lo marcó y la nota en la bitácora. Botones **Cancelar** / **Enviar a ventas** (crea la venta `SAL-...`).

## /admin/cotizaciones/[quoteId]
Edita una cotización existente; es el mismo asistente de 3 pasos abierto en modo edición.

**Qué se ve:** pasos Productos, Cliente y **Finalizar**. En el último paso además: **Estado** (Revisión / Enviada / Aceptada / Rechazada / Expirada) y **Valida hasta** (fecha), y Notas.

**Botones y acciones:**
- **Agregar producto**, **Siguiente**, **Atras**, **Agregar cliente**/**Editar cliente**: igual que al crear.
- **Editar** (ícono de lápiz junto al de borrar, en cada fila del paso 1; también al crear una cotización): abre el panel "Editar producto" con los datos de la línea para cambiar cantidad, color (de la carta, escrito a mano o por parte), **Precio** (casilla que sale solo al editar; al agregar el precio sale del catálogo), **Descuento**, **Costo adicional**, descripción y foto. No deja cambiar el producto ni el tipo de venta. En celular el panel ocupa toda la pantalla, con «Total a pagar», **Cancelar** y **Guardar cambios** siempre abajo; en pantallas táctiles «Cambiar foto» se ve siempre como una franja al pie de la foto (con ratón, al pasar por encima). La casilla **Precios al por mayor** vuelve a poner el precio de lista en las líneas sueltas, aunque se haya cambiado a mano. **Guardar cambios** del panel cambia la línea en su sitio y recalcula el resumen al instante (queda en la base al tocar el **Guardar cambios** final); **Cancelar** cierra sin cambiar nada. Un combo sigue siendo una fila: se editan cantidad y precio por combo (el precio nuevo se reparte entre sus piezas), y el descuento y el costo adicional se reparten entre sus piezas, que se conservan. La cantidad debe ser entera y el descuento no puede pasar de cantidad × precio + costo adicional. Si no se toca el color, la línea lo conserva tal cual. Con venta creada no aparece **Editar**.
- **Guardar cambios**: guarda la cotización. Cerrar (X, aria-label "Cerrar") vuelve a `/admin/cotizaciones`.
- **En celular**: igual que al crear: tarjetas con **Editar** y borrar en vez de tabla (menos de 1024 px; con venta, sin **Editar**) y los botones **Atras**, **Siguiente** y **Guardar cambios** siempre abajo.
- Si la cotización ya tiene venta, en el paso 1 sale el aviso "Esta cotización ya tiene venta: sus productos no se pueden cambiar. Puedes editar las notas y el estado." y sus productos (cantidades, precios, color y descripción de cada línea) no se pueden cambiar: al guardar sale el error "Esta cotización ya tiene venta: sus productos no se pueden cambiar. Puedes editar las notas y el estado." Las notas, el estado, la validez y el cliente sí se guardan.
- Para pasarla a venta no hay botón aquí: se hace desde el menú "⋯" de la lista (**Enviar a ventas**).

## /admin/ordenes
Lista de órdenes de venta y de compra a proveedor.
**Qué se ve:** franja con íconos Ordenes / Activas / Produccion / Cerradas. Tabla: ícono de nota (solo en las órdenes con notas, con un número pequeño en la esquina con la cantidad de notas de la orden; desde 100 dice «99+»; al pasar el mouse o tocarlo muestra la última nota, quién la escribió y cuándo), Orden, Venta (en compras sale el código `COM-...`), Cliente, Responsable, Estado, **Entrega y fabricación**, Total, Fecha. En celular el ícono sale junto al código de la orden. La columna "Entrega y fabricación" (también en la tarjeta de celular) muestra el chip "Entrega: …" (el peor de los despachos no cancelados ni devueltos) y el chip "Fabricación: …" (la peor OF de las proveedoras con productos de fabricación; sin OF abierta sale "Sin fecha"). Cada chip dice A tiempo, Por vencer, ATRASADO N h / N días, En camino, Entregado a tiempo, Entregado tarde o Sin fecha. En las compras y en las órdenes sin nada pendiente sale "—"; en las órdenes cerradas o canceladas solo se ve lo ya entregado. En Estado, una orden completada con productos de entrega deshecha dice "Entregado parcial – N sin entregar" (ámbar) en vez de "Completada"; al volver a entregarlos vuelve sola. Buscador "Buscar orden, venta, cliente o nota" (al escribir busca en todas las órdenes, también en el texto de sus notas) y filtro "Rango de fechas", que por defecto es el mes actual. Las órdenes abiertas se ven siempre. Filtro **Seguimiento** (lista junto al rango de fechas) con Todos, A tiempo, Por vencer, Atrasado, En camino, Entregado a tiempo, Entregado tarde y Sin fecha: deja solo las órdenes con alguno de sus dos chips en ese estado, de cualquier fecha (mientras está puesto, el rango de fechas se oculta y sale "Todas las fechas"; si no hay ninguna, dice "Ninguna orden con ese seguimiento."); si además se escribe en el buscador, se aplican los dos. "Todos" vuelve a la lista normal.
**Qué se ve:** franja con íconos Ordenes / Activas / Produccion / Cerradas. Tabla: ícono de nota (solo en las órdenes con notas; al pasar el mouse o tocarlo muestra la última nota, quién la escribió y cuándo), Orden, Venta (en compras sale el código `COM-...`), Cliente, Responsable, Estado, **Entrega y fabricación**, Total, Fecha. En celular el ícono sale junto al código de la orden. La columna "Entrega y fabricación" (también en la tarjeta de celular) muestra el chip "Entrega: …" (el peor de los despachos no cancelados ni devueltos) y el chip "Fabricación: …" (la peor OF de las proveedoras con productos de fabricación; sin OF abierta sale "Sin fecha"). Cada chip dice los días por día calendario en hora de Colombia: "vence hoy", "vence mañana", "quedan N días", "venció hoy", "venció ayer", "lleva N días de atraso", "En camino · quedan N días", o "Entregado a tiempo", "Entregado tarde" o "Sin fecha" (ej. "Entrega: vence hoy", "Fabricación: quedan 3 días"). El color sigue igual: rojo vencido, ámbar si faltan menos de 24 horas, azul a tiempo. Con varios despachos en el mismo estado sale la fecha más cercana. En las compras y en las órdenes sin nada pendiente sale "—"; en las órdenes cerradas o canceladas solo se ve lo ya entregado. En Estado, una orden completada con productos de entrega deshecha dice "Entregado parcial – N sin entregar" (ámbar) en vez de "Completada"; al volver a entregarlos vuelve sola. Buscador "Buscar orden, venta, cliente o nota" (al escribir busca en todas las órdenes, también en el texto de sus notas) y filtro "Rango de fechas", que por defecto es el mes actual. Las órdenes abiertas se ven siempre. Filtro **Seguimiento** (lista junto al rango de fechas) con Todos, A tiempo, Por vencer, Atrasado, En camino, Entregado a tiempo, Entregado tarde y Sin fecha: deja solo las órdenes con alguno de sus dos chips en ese estado, de cualquier fecha (mientras está puesto, el rango de fechas se oculta y sale "Todas las fechas"; si no hay ninguna, dice "Ninguna orden con ese seguimiento."); si además se escribe en el buscador, se aplican los dos. "Todos" vuelve a la lista normal.
**Botones y acciones:**
- **Nuevo**: abre el modal "Comprar" (compra directa a proveedor). Pide la fecha y luego **Agregar producto**: buscador "Buscar codigo o producto", Proveedor, Cantidad, **Pendientes por fabricar** (por defecto 0: de la cantidad, cuántas aún no fabrica la proveedora; se cobran completas pero no entran al inventario), Costo unitario, Color, Descripción y foto. Muestra el "Total compra". **Registrar compra** guarda la compra y **Cancelar** cierra.
- Menú de fila (tres puntos):
  - **Abrir**: abre el detalle de la orden.
  - **Ver ventas**: solo en órdenes de venta. Lleva a `/admin/ventas`.
  - **Editar compra**: solo en compras. Abre `/admin/ordenes/<id>/editar-compra`.
  - **Anular compra**: solo en compras que no están canceladas. Abre "Anular la compra <código>", pide **Motivo** (mínimo 3 letras) y se confirma con **Anular compra**. La compra queda Cancelada con su número, el stock sale con una salida nueva ("Reversa por anulación de compra COM-…") y sus cargos a la proveedora se anulan. Si la compra tiene pagos a la proveedora, no deja: primero se anulan esos pagos en la cuenta de la proveedora.
- La orden de venta **no** se crea aquí. Se crea en `/admin/ventas`, con el menú de fila de la venta → **Crear orden**. Si la venta ya tiene orden, el menú muestra **Ver orden**.

## /admin/ordenes/[orderId]
Detalle de una orden. Aquí se fabrica, se recoge, se despacha y se entrega cada producto.
**Qué se ve:** el código de la orden y la venta y el cliente. Insignias "Pago: …" (o "Forma de pago sin definir") y "Origen: …". En órdenes de venta, botón **Cambiar forma de pago** (quien tiene acceso a Ventas o Cotizaciones): diálogo "Forma de pago" (50/50, Pago total o Contraentrega, sin "Sin definir"; aquí Pago total no exige el 100 %) → **Cancelar** / **Guardar**; queda en la bitácora. El código de la venta abre `/admin/ventas` filtrado por esa venta. En órdenes de venta, una franja plegable, cerrada por defecto: una línea "Nombre · teléfono · Ciudad, Departamento" (o "Recoge en bodega"; en celular corta con "…") y, siempre a mano sin abrirla, los botones **WhatsApp**, **Copiar datos de envío** (primero "Referencia: ORD-… / SAL-…" y luego nombre, teléfono, dirección y ciudad, para pegar a la transportadora; no sale si recoge) y **Ver cotización** (abre el enlace público en otra pestaña). Al tocar la línea se abre el detalle: **Cliente** (nombre, teléfono e Instagram si hay), **Entrega** (dirección y ciudad del último despacho activo, con transportadora y guía; si la ficha del cliente tiene otra dirección, "Ficha actual: …"; sin despacho, la de la ficha con la etiqueta "Ficha del cliente (aún sin despacho)"; si recoge, "Recoge en bodega") y **Cotización** (código, fecha, quien la hizo y notas) con **Editar** (solo con acceso a Cotizaciones). La franja queda abierta o cerrada en las demás órdenes, según la última elección en ese navegador. Lo que falta dice "Sin dato" en ámbar. Tarjetas Total, **Valor ganado** (con "Ver desglose →", que lleva a `/ganancia`), Produccion y Despachos. Una insignia de avance con todo lo pendiente (ej. "Pendiente recoger 3 · despachar 1"; con una sola etapa, "Pendiente recoger 3 productos") o "Despachado". Tabla de productos con columnas Producto, Detalle y Estado. El estado puede ser Sin confirmar, Fabricando, Recogido, Despachado o Entregado, y si se pulsa el estado se puede deshacer. A la derecha está el avance en 4 pasos (Fabricar → Recoger → Despachar → Entregar) y los recuadros "Envío" y "Guías Magilus". La insignia de estado de arriba dice "Entregado parcial – N sin entregar" (ámbar) si la orden está cerrada pero hay productos con la entrega deshecha. Si la venta es contraentrega, la orden está cerrada y hay productos reversados, sale bajo el encabezado el aviso ámbar "Esta venta ya cuenta en Balances y tiene N producto(s) reversado(s). El dinero, los fletes y las comisiones no se recalculan solos: administración decide" (no cambia nada). Debajo, la tarjeta **Fechas de entrega** (solo si hay despachos no cancelados), la tarjeta **Notas**, la tarjeta **Fotos del embalaje** (solo si hay), la tarjeta **Reversas** (solo si hay) y, abajo, las pestañas **Historial**, **Abonos** (con "Total abonado") y **Fabricación** (esta última solo en órdenes de venta).
**Botones y acciones:**
- Menú de la orden (arriba a la derecha):
  - **Editar orden**: modal "Editar orden" con "Fecha de la orden" y el modo de cada producto (Stock / Fabricación). Se guarda con **Guardar cambios**.
  - Cambio de estado, según cómo esté la orden: **Liberar**, **Iniciar produccion**, **Marcar despachada** o **Cerrar orden**.
  - **Cancelar**: modal "Cancelar orden". Pide el Motivo y se confirma con **Cancelar orden** (o **Volver**).
- Botón de cada producto (el texto cambia según la etapa):
  - **Fabricar**: para productos de fabricación. Abre "Confirmacion de compra": Proveedor (lista de los proveedores del producto), Costo de compra y **Fecha de entrega de fabricación** (obligatoria; calendario sin días pasados y atajos **+7 días**, **+10 días** y **+15 días**), con el "Total a pagar". Sin fecha, **Confirmar compra** queda apagado y sale "Elige la fecha de entrega de fabricación". La fecha se guarda en la OF de esa proveedora (a las 5:00 p. m.), se ve en la pestaña Fabricación (donde se puede cambiar), queda en "Historial de fechas" y la ve la proveedora en su enlace. Si la proveedora ya tiene OF en la orden, el campo trae su fecha (si no ha pasado) y avisa "Esta fecha es de toda la OF-… de …": cambiarla cambia toda la OF. **Confirmar compra** fija la proveedora y el costo, pasa el ítem a producción y crea el saldo a favor de la proveedora. Al confirmar, el cuadro se cierra (no se abre solo el de Recoger) y el producto queda en "Fabricando" con su botón **Recoger** en la fila, para pulsarlo cuando esté listo. Si el producto no tiene proveedores, sale el aviso "El producto no tiene proveedores. Agregalos en el catalogo para confirmar."
  - **Confirmar**: para productos de stock. Abre "Confirmar salida de stock" y se confirma con **Confirmar y descontar de stock**, que descuenta las unidades del inventario y cierra el cuadro; **Recoger** se pulsa luego en la fila. El recuadro **Costo que se va a usar** muestra el costo y su compra (ORD-...) o "costo de catálogo" si no hay compra; no se edita. En la línea confirmada se ve "Costo $X c/u (ORD-...)".
  - **Recoger**: aparece cuando el producto ya está confirmado. Pide "Foto del producto terminado" (es obligatoria) y se guarda con **Marcar como recogido**. Si ya estaba recogido, el lápiz "Editar despacho" deja editarlo y se guarda con **Guardar cambios**. Aquí no se paga a la proveedora: el formulario deja el pago como pendiente ("Pago pendiente" o "Pagado al proveedor.").
  - **Despachar**: aparece cuando el producto está recogido. Abre el modal de despacho con estos campos:
    - "Modalidad de entrega": Transportadora o Recoge en Bodega.
    - "Fecha y hora estimada de entrega" (obligatoria en las dos modalidades). Sin ella sale "Pon la fecha y hora estimada de entrega" y el despacho no se crea.
    - Con transportadora: "Transportadora", "Costo de envio (gasto de la venta)" (el flete) y "Pagado desde (cuenta)" (lista **Elige la cuenta**). El "Comprobante del pago" es obligatorio salvo en efectivo.
    - "Otros proveedores de envio": el botón **Agregar** suma un "Tramo 2, 3…" con Proveedor, valor, "Guia (opcional)", "Nota (ej. Bogota a Cali)", cuenta y comprobante. **Quitar** borra el tramo. Debajo se ve el "Total del envio".
    - También: "Foto de la guia", el check "Crear guía Magilus (MG) para el cliente" (con Ciudad destino y Peso) y Notas.
    - Con transportadora, fotos del embalaje: "Foto 1: producto empacado, paquete abierto" y "Foto 2: paquete cerrado con la guía" (obligatorias) y "Fotos extra (hasta 3)". Máximo 5 por producto. Si falta una, sale "Falta la foto 1: …" o "Falta la foto 2: …" y el despacho no se crea. En "Recoge en Bodega" no se piden. Si la proveedora ya subió la foto 1 y la foto 2 desde su enlace (**Listo para despacho**), sale en verde "Fotos del embalaje ya subidas por la proveedora" con las miniaturas, esos dos campos dejan de ser obligatorios y al despachar esas fotos quedan ligadas al despacho.
    - **Despachar producto** guarda el despacho.
  - **Separar unidades** (enlace bajo el producto, si hay más de 1 unidad): divide la línea en dos. Se confirma con **Separar**.
  - **Cambiar color** (enlace junto a "Color: …" bajo el producto, en ventas no canceladas): abre "Cambiar color" con la carta de colores del CRM (o **Escribir otro color**) y el "Motivo" obligatorio (3 letras o más). Si el producto (o su combo) tiene partes de color, en vez de la carta sale **Color por parte** con un desplegable por parte (como en el editor de cotizaciones): solo cambian las partes elegidas y al guardar se vuelve a hacer la imagen con colores en la cotización y la orden ("Escoge el color de cada parte para guardar." si alguna queda en Por definir). **Guardar color** cambia solo el color en la cotización, la orden, la factura y la OF (en un combo, en todas sus piezas) y deja la nota "Cambio de color de …: viejo → nuevo. Motivo: …" en **Notas**. No cambia precios ni pagos. Si el producto ya está en la OF de una proveedora, el mensaje dice "Color cambiado. Avísale a <proveedora> en la pestaña Fabricación" y la OF le muestra el aviso a la proveedora; a nadie se le manda nada solo.
  - **Cambiar imagen** (enlace junto a "Imagen: …" bajo el producto, en ventas no canceladas; en un combo, en cada pieza): abre "Cambiar imagen" con la imagen actual. Se escoge un archivo JPG, PNG o WEBP (hasta 15 MB) o se pega con Ctrl+V, se ve la vista previa y **Guardar imagen** la deja como la imagen que ve la proveedora en su OF (`/of/<código>`). Si el producto ya tiene imagen de colores, esa sigue de principal y en la OF las dos imágenes salen lado a lado: "Con los colores a fabricar" e "Imagen de referencia del producto" (en celular, una encima de la otra; al imprimir, lado a lado). **Volver a la imagen del catálogo** (solo si ya se subió una) la quita. Cambia solo ese producto en esa orden: no toca el catálogo, la cotización, precios, pagos ni estados, y deja la nota "Imagen de … cambiada por <persona>" (o "restaurada a la del catálogo por <persona>") en **Notas** y en la bitácora. La página de la proveedora sigue siendo solo de lectura.
  - **Reversar despacho:** se pulsa el chip **Despachado ↻** del producto y se abre el diálogo "Reversar despacho". Pide elegir el motivo ("No llegó al cliente", "Llegó dañado", "Producto equivocado (modelo, color o medida)", "Faltan piezas", "El cliente lo rechazó o lo devolvió", "Se devolvió a la proveedora (garantía o arreglo)", "Se registró por error" u "Otro", que pide escribir cuál) y un comentario opcional; **Sí, reversar despacho** queda apagado hasta elegir el motivo. El producto vuelve a "Recogido" para despacharlo de nuevo. Si iba con otros productos en el mismo despacho, ellos siguen "Despachado" y el valor del envío no cambia; si iba solo, se anulan el despacho, sus fletes y los movimientos de la transportadora. El motivo queda en el Historial. Si el despacho ya está entregado, sale "Primero reversa la entrega".
  - **Reversar entrega de un producto:** cuando el despacho está entregado cada producto muestra el chip verde **Entregado ↻**. Al pulsarlo se abre el diálogo "Reversar entrega", con los mismos motivos y el comentario opcional; **Reversar entrega** queda apagado hasta elegir el motivo. Con "Llegó dañado" sale el campo obligatorio "Foto de cómo llegó (obligatoria)" y el botón no se enciende sin la foto; si falta, sale "Falta la foto de cómo llegó" y no se reversa nada. Solo ese producto vuelve a "Despachado"; los demás siguen "Entregado" y la orden, su fecha de entrega, el despacho, el flete y los pagos no cambian (la venta no se mueve en Balances). Queda anotado con el motivo en la bitácora.
  - **Registrar entrega** (botón a la derecha de un producto con la entrega reversada): lo vuelve a "Entregado" sin pedir motivo y anota "Volvió a entregar <producto>" en la bitácora.
  - Para deshacer recogido o fabricación se pulsa el estado y se confirma con **Si, deshacer recogido** / **Si, devolver a stock** o **Si, deshacer fabricacion**. Se ve igual que antes, pero nada se pierde: los fletes, los pagos a la transportadora y el despacho quedan guardados en los anulados con el motivo del despacho reversado; el pago a la proveedora del recogido, con "Deshizo el recogido de un producto de ORD-…"; y el cargo a la proveedora y el trabajo de producción, con "Deshizo la fabricación de un producto de ORD-…". Si el cargo de la fabricación ya tiene abonos, no deja y dice "Primero anula los abonos".
- Despacho en lote: se marcan las casillas de productos (o "Seleccionar todos"). Si entre lo marcado hay productos Recogidos, aparece "Despachar N" solo con esos y al lado "Quedan fuera (sin recoger): …" con los que aún se fabrican; todos los Recogidos salen en un solo despacho (una guía, un envío). Sin Recogidos, los productos deben estar en la misma etapa para ver "Confirmar N" o "Recoger N" (si no, sale "Selecciona productos en la misma etapa para actuar en lote."). **Limpiar** quita la selección. El **Despachar** de cada fila despacha solo ese producto.
  - **Confirmar productos**: usa la proveedora sugerida. Si hay productos de fabricación, pide la **Fecha de entrega de fabricación** (mismo campo y atajos; sin ella el botón queda apagado) y lista "La fecha se aplica a:" cada OF con sus productos (ej. "OF-35 · Laura: Silla, Camilla" u "OF nueva · Ana: Tocador"); los que no tienen proveedora propia salen en "Sin proveedora propia, se omite: …". Al confirmar, el cuadro se cierra y la selección se limpia; **Recoger** se pulsa cuando el producto esté listo.
  - **Marcar como recogidos**: una foto para todos.
  - **Despachar productos**: el modal "Despachar N productos" dice cuáles salen juntos y, en ámbar, "Quedan fuera (sin recoger): …". Pide "Fecha y hora estimada de entrega" (obligatoria, también en "Recoge en Bodega"), "Costo de envio por producto", la cuenta y el comprobante, y deja agregar otros tramos con **Agregar**. Con transportadora también pide las mismas 3 fotos del embalaje ("Foto 1: producto empacado, paquete abierto", "Foto 2: paquete cerrado con la guía", "Fotos extra (hasta 3)"); una foto abierta y una cerrada sirven para todos los productos del despacho. Si todos los productos elegidos ya tienen las fotos de la proveedora, sale "Fotos del embalaje ya subidas por la proveedora" con las miniaturas de cada uno y no se piden de nuevo.
  - Al guardar sale "Despachados N productos · Faltan por despachar: …" (o "Despachado 1 producto"). Si un producto cambió en otra pestaña y ya no está listo, no se despacha nada ni se registra flete, y el error dice "No se despachó nada. <producto>: <por qué>".
  - La orden pasa a Despachada solo cuando todos sus productos están despachados (también desde **Despachar** en `/admin/despachos`). **Marcar despachada** con productos pendientes dice "Faltan por despachar: …".
- Recuadro "Envío" (cuando hay un despacho con transportadora): muestra cada tramo con su valor y "Pagado desde …" o "Pago sin cuenta registrada", y el "Total envío".
  - **Agregar tramo**: abre el modal "Agregar tramo al despacho <código>" con Transportador, Valor, Guía, Nota, cuenta y comprobante. **Guardar tramo pagado** suma ese valor al flete de la venta.
- Recuadro "Guías Magilus": **Crear guía Magilus** (con "Peso kg" opcional) aparece en despachos que aún no tienen guía. Si la guía ya existe, se pulsa para abrir su detalle.
- Paso Entregar: queda listo solo con todos los productos despachados y todos los despachos entregados. Con varios despachos, **Registrar entrega** toma el primer despacho sin entregar. **Registrar entrega** abre la ventana "¿Confirmas que el cliente YA RECIBIÓ el pedido?" con Orden, Venta, Cliente, Ciudad, Transportador y Guía (si la hay; lo que falte dice "sin dato"). Si la venta es contraentrega sale el aviso "Al registrar la entrega, esta venta cuenta como pagada en Balances". Debajo, "Foto de la cliente que recibió", Instagram y TikTok (opcionales) y la casilla obligatoria "Confirmé con el cliente o con el transportador que se entregó". **Sí, se entregó** (verde) queda apagado hasta marcar la casilla y registra la entrega; **Cancelar** cierra sin cambiar nada. Cuando todo está hecho aparece **¿No se entregó? Deshacer entrega**, que pide elegir el motivo ("No llegó al cliente", "Llegó dañado", "Producto equivocado (modelo, color o medida)", "Faltan piezas", "El cliente lo rechazó o lo devolvió", "Se devolvió a la proveedora (garantía o arreglo)", "Se registró por error" u "Otro", que pide escribir cuál) y un comentario opcional; **Sí, deshacer entrega** queda apagado hasta elegir el motivo. Con "Llegó dañado" también pide "Foto de cómo llegó (obligatoria)", que queda para cada producto de ese despacho. Deshacer la entrega de toda la orden también quita las reversas de cada producto de ese despacho.
- Tarjeta **Fechas de entrega** (solo si hay despachos no cancelados): una fila por despacho con su código, el estado (chip con los días, igual que en la lista: "vence hoy", "vence mañana", "quedan N días", "venció hoy", "venció ayer", "lleva N días de atraso", "En camino · …", "Entregado a tiempo/tarde" o "Sin fecha"; un devuelto dice "Devuelto"), "Entregado el …" si ya se entregó, el campo "Fecha y hora estimada de entrega" y el botón **Guardar fecha**. Debajo, el historial de cambios: fecha y hora de Colombia, quién y "Cambió la fecha estimada de DSP-…: antes → después". Si la fecha no cambió sale "La fecha no cambió" y no se anota nada.
- Pestaña **Fabricación**: muestra una tarjeta por proveedora (la OF) con sus productos, el chip de estado de la OF (como en despachos), "Recibido el …" si ya se recibió, "Pagado … · Falta …" y la lista de pagos (con **Comprobante**). Campos "Fecha y hora estimada de entrega" (obligatoria; en una OF vieja sin ella sale "Fecha anterior: …" como ayuda), "Fecha real (recibido)" (opcional; vacía la borra; no puede ser en el futuro), "Dirección de despacho" y "Notas para la proveedora", que se guardan con **Guardar datos de entrega**. **Marcar recibido** (solo si aún no tiene fecha real) pone la fecha real en este momento. La fecha real también se llena sola cuando se despacha el último producto de esa proveedora (en el historial sale "Automático (al despachar)"); deshacer el despacho no la borra. Debajo, "Historial de fechas" con quién y cuándo ("Cambió la fecha estimada o real de OF-…: …"). Botones del enlace de la proveedora (link corto `/of/<código>`, ej. `magilus.com/of/OF-00035`; los links viejos `/fabricacion/<token>` siguen sirviendo):
  - **Ver**: abre el enlace.
  - **Copiar enlace**: copia el enlace.
  - **Copiar datos de fabricación** (al lado de **Ver**): copia el texto para esa proveedora con la referencia ORD/SAL/OF, la fecha de entrega y, por producto, cantidad, nombre, código, color, detalle e imagen, más las "Notas para la proveedora". Solo trae los productos de esa proveedora; no lleva datos del cliente ni dinero. Sigue activo sin fecha estimada (el texto dice "Sin fecha"). Al copiar sale "Datos de fabricación copiados". Usa lo último guardado.
  - **Enviar por WhatsApp**: manda un mensaje con el enlace al WhatsApp de la proveedora.
  - Mientras la OF no tenga fecha estimada, **Copiar enlace** y **Enviar por WhatsApp** salen apagados con el texto "Falta la fecha estimada" (**Ver** sigue activo).
  - Si se cambió el color de un producto de esa OF y la proveedora aún no toca **Ya lo vi**, la tarjeta muestra en ámbar "Cambio de color sin ver (fecha): producto viejo → nuevo" y el botón verde **Avisar cambio de color por WhatsApp**, que abre WhatsApp con "Cambio de color en OF-<n>: <producto> pasa de <viejo> a <nuevo>" y el enlace `/of/<código>`. Cuando ella lo marca, la tarjeta dice "Visto por la proveedora el <fecha> (cambio de color)".
- Pestaña **Historial**: si se pulsa un movimiento se abre "Editar fecha del movimiento", que se guarda con **Guardar**.
- Tarjeta **Fotos del embalaje** (solo lectura, solo si hay fotos; solo interna): por producto, las fotos en orden Abierto, Cerrado, Extra, cada una con "Subida por <nombre>" y la fecha y hora de Colombia. Al tocar una foto se abre en grande en otra pestaña. Incluye las que subió la proveedora antes de despachar. Si el producto tiene fotos de llegada (las de "Llegó dañado"), se ven en dos columnas lado a lado: "Salió así" (Abierto, Cerrado, Extra) y "Llegó así" (Llegada), cada una con quién la subió y cuándo. "Reversar despacho" no pide foto.
- **Registrar devolución** (botón junto al menú de la orden, arriba a la derecha; solo en órdenes de venta no canceladas con un despacho En camino, Entregado o Devuelto que aún tenga unidades por devolver, o "Sin despacho" en una orden Despachada o Cerrada sin despachos vivos): abre "Registrar devolución" con "Despacho", "Fecha" (hoy o antes), "Productos devueltos" (cantidad por producto, "de N"; el enlace **Volvió todo** llena todo), "Motivo" ("Producto en mal estado", "El cliente no lo quiso", "Dirección errónea", "El cliente no contestó" u "Otro", que pide "¿Cuál?"), "Dónde está" ("En tránsito", "En bodega", "Perdido"), "Qué sigue" ("Por definir", "Reenviar", "Cambiar el producto", "Reparar", "Cerrar"), "Transportadora" (lista, trae la del despacho) y "Otra / guía (opcional)", "Flete de vuelta (informativo)" ("No descuenta nada. Si se paga, regístralo aparte."), "Comentario" y "Fotos o PDF (opcional)" (JPG, PNG, WEBP o PDF; hasta 6 archivos de 12 MB y 15 MB entre todos). **Guardar devolución** queda apagado hasta poner al menos una cantidad válida. Si el despacho iba En camino y volvió todo sale "Volvió todo: el despacho pasa a Devuelto y la guía también. La orden no cambia."; si ya estaba Entregado, "Ya estaba entregado: los productos que volvieron completos quedan como no entregados. El dinero no cambia." (y se crea una reversa con el motivo "El cliente lo rechazó o lo devolvió"). Una devolución de una parte solo queda registrada. Nunca crea fletes, cargos, abonos ni movimientos de inventario, y la orden no cambia de estado. Al guardar sale "Devolución registrada" y queda en la bitácora con la orden y quién la registró.
- Insignia y paso de devolución: arriba, "Devuelta" (violeta) si las devoluciones abiertas cubren toda la orden, "Devolución parcial" (ámbar) si solo una parte, o "Devuelta – falta registrar" (ámbar) si hay un despacho Devuelto sin devolución registrada cuyos productos no volvieron a salir. El avance de 4 pasos muestra al final un paso extra con esa misma etiqueta. En una contraentrega cerrada con devoluciones abiertas, el aviso ámbar dice "Esta venta ya cuenta en Balances y tiene N devolución(es) abierta(s). …" (no cambia nada).
- Tarjeta **Devoluciones** (solo lectura, solo si hay): de la más nueva a la más vieja, cada una con la fecha, el despacho (o "Sin despacho"), "Abierta" / "Cerrada" / "Anulada", el motivo, los productos y cantidades, "Transportadora", "Dónde está", "Qué sigue", el comentario, las evidencias (miniatura o "PDF"; al tocar se abren en otra pestaña), "Pérdida logística (informativa)" (flete de ida de lo devuelto, flete de vuelta y total) con la aclaración "El flete de vuelta no descuenta nada. Si se paga, se registra aparte.", y quién la registró con la fecha y hora de Colombia.
- Tarjeta **Reversas** (solo lectura, solo si la orden tiene reversas): de la más nueva a la más vieja, cada una con el producto (o "Toda la orden"), el cambio de estado (ej. "ENTREGADO → DESPACHADO"), el motivo (ej. "Llegó dañado" u "Otro: …"), el comentario, quién y la fecha y hora de Colombia. No se editan ni se borran.
- Tarjeta **Notas** (solo para el equipo; no sale a la clienta ni a la proveedora): botón **Agregar nota** arriba a la derecha, que abre una ventana con el cuadro de texto (máximo 1.000 letras) y el botón **Guardar nota**. Debajo, las notas de la más nueva a la más vieja con quién la escribió y la fecha y hora de Colombia. En las notas propias sale **Borrar** (pide confirmar); las notas no se editan. Cada nota queda en la bitácora de la orden ("Agregó una nota: …").

## /admin/ordenes/[orderId]/editar-compra
Edita una compra directa a proveedor. Si la orden es de venta, la página manda al detalle de la orden.
**Qué se ve:** el mismo modal de compra, con el título "Editar compra <código>", la fecha y las líneas ya cargadas. Una compra por lote (con pendientes por fabricar) no se edita aquí: al guardar sale "Esta compra es por lote: se maneja en Inventario → Lotes".
**Botones y acciones:**
- **Agregar producto**: agrega una línea a la compra.
- **Registrar compra**: guarda los cambios.
- **Cancelar**: cierra sin guardar.

## /admin/ordenes/[orderId]/ganancia
Desglose del valor ganado en una orden de venta. Solo se puede leer.
**Qué se ve:** tarjetas Total de la venta, Costo de compra, Costo de envío y Valor ganado. Tabla "Detalle por producto" con Producto, Cant., Precio venta, Costo compra, Total venta, Total costo y Ganancia. Cuadro "Cálculo del valor ganado": venta − costo de compra − flete, con un renglón por cada flete.
**Botones y acciones:**
- **Volver a la orden**: regresa al detalle de la orden.

## /admin/produccion
Lista de trabajos de fabricación. Se crean al confirmar productos de fabricación en la orden.
**Qué se ve:** tarjetas Trabajos / Pendientes / En curso / Terminados. Tabla con Trabajo, Orden (enlace a la orden), Producto, CANT, Responsable, Vencimiento y Estado.
**Botones y acciones:**
- Menú de fila → **Cancelar**: cancela el trabajo. Solo aparece si el trabajo no está terminado ni cancelado.

## /admin/despachos
Lista de despachos y de las ventas pagadas que aún no se han despachado.
**Qué se ve:** tarjetas Pagadas sin despachar / Despachos / Pendientes / En camino / Entregados.
- Tabla "Pagadas sin despachar": Venta, Cliente, Total pagado, Ultimo pago y Estado de la orden.
- Tabla de despachos: Despacho, Orden, Cliente, Transportadora (con "+N" si hay varios tramos), Guia, Estado, Fecha y Acciones.
**Botones y acciones:**
- **Ver orden** / **Ver venta**: en la tabla de pagadas sin despachar, abren la orden o la venta.
- **Ver**: abre el modal "Despacho <código>" con cliente, tipo de entrega, transportadora, guía, "Costo de envío (a pagar)", los tramos, la dirección y los productos. En los productos se reparte el flete por producto y se guarda con **Guardar reparto** (el reparto debe sumar el total). Debajo de los productos, la tarjeta **Fotos del embalaje** (solo si hay) con las fotos de ese despacho por producto (Abierto, Cerrado, Extra; "Subida por <nombre>", fecha y hora; al tocar una se abre en grande). Tiene también **Ver comprobante de envío**.
- Botones de estado, según el estado del despacho:
  - **Empacar**: si está pendiente o devuelto.
  - **Despachar**: si se está empacando. La orden pasa a Despachada solo si con eso todos sus productos quedan despachados.
  - **Entregar**: si va en camino. Abre la misma ventana "¿Confirmas que el cliente YA RECIBIÓ el pedido?" del detalle de la orden (Orden, Venta, Cliente, Ciudad, Transportador, Guía si la hay y el aviso de contraentrega), sin foto ni redes. **Sí, se entregó** queda apagado hasta marcar "Confirmé con el cliente o con el transportador que se entregó"; **Cancelar** deja el despacho En camino.
  - **Cancelar**: si no está entregado ni cancelado.
- Esta pantalla no crea despachos ni registra el flete. Eso se hace en el detalle de la orden.

## /admin/despachos/guias
Lista de las guías Magilus (MG) que sigue el cliente.
**Qué se ve:** el título "Guías Magilus" y los filtros **Activas**, **Con novedad**, **Entregadas** y **Todas**. Cada guía muestra su código, estado, la orden y el despacho, el destino, "Va en", "Estimada", "Cobro al recibir" y "Proveedor (interno)".
**Botones y acciones:**
- Al pulsar una guía se abre su detalle. Las guías se crean desde la orden: con el check del modal Despachar, o con el botón **Crear guía Magilus**.

## /admin/despachos/guias/[shipmentId]
Detalle de una guía Magilus.
**Qué se ve:** tarjetas Destino, Va en, Entrega estimada, Paga al recibir y Peso. Recuadros "Enlaces" (Transportador y Cliente), "Línea de tiempo", "Fecha estimada y destino" y "Transportadora (interno)".
**Botones y acciones:**
- **Guías**: vuelve a la lista. También hay un enlace a la orden y su despacho.
- Menú del transportador:
  - **Enviar por WhatsApp**: envía el mensaje con el enlace.
  - **Generar enlace nuevo**: crea un enlace nuevo.
  - **Desactivar enlace** / **Activar enlace**: apaga o prende el enlace.
  - Un botón de copiar ("Copiar mensaje para el transportador").
- Menú del cliente:
  - **Abrir guía**: abre la guía.
  - **Abrir documento de la guía**: abre el documento de la guía.
  - **Copiar solo el enlace directo**: copia el enlace directo.
  - **Copiar enlace de consulta**: copia el enlace de consulta.
  - Un botón de copiar ("Copiar mensaje para el cliente").
- **Agregar evento**: abre el formulario del evento. Tiene pestañas Etapa / Novedad / Nota, con Ciudad, Quién recibió, Nota, "Foto (opcional)" y el check "Visible para el cliente". Se guarda con **Agregar evento**.
- **Cambiar**: cambia la fecha estimada. Tiene un motivo y el check "Avisar el cambio en la consulta del cliente".
- **Guardar destino**: guarda la ciudad destino.
- **Guardar**: guarda el "Cobro al recibir (COP)". Otro botón **Guardar** guarda el "Peso (kg)".
- **Ver foto de la guía del proveedor**: aparece si hay foto.

## /admin/despachos/transportadora
Seguimiento de los envíos con transportadora: guías por registrar y entregas pendientes.
**Qué se ve:** el título "Envíos con transportadora" y tarjetas Sin guía / Pendiente por entregar / Entregados (N días). Los envíos se agrupan por transportadora, en las secciones "Sin guía" y "Pendiente por entregar". Al final hay una lista plegada "Entregados en los últimos N días". Cada fila muestra el despacho, la orden, la cotización, la venta, la forma de pago, la guía MG (o "Sin guía MG"), "Guía:", "Envío:" y "Despachado:".
**Botones y acciones:**
- **← Despachos**: vuelve a Despachos.
- **Copiar mensaje**: copia el mensaje para esa transportadora.
- **Guardar guía**: está en las filas sin guía. Pide el "Número de guía" y la foto de la guía.
- **Guardar**: guarda "¿Qué respondió la transportadora?".
- **¿No se entregó? Corregir en la orden**: está en los entregados y lleva a la orden.

## /admin/balances
Rentabilidad del mes (ventas, costos, gastos, ganancia) y saldo de cada cuenta.
**Qué se ve:** arriba la franja **Dinero hoy** (saldo de hoy por tipo, "Total disponible" y lista de cuentas; cada nombre abre `/admin/balances/cuentas/<id>`). Selector de mes (flechas "Mes anterior"/"Mes siguiente" y el mes en el centro para elegir). Pestañas **Resumen** (gráfico "Rentabilidad por venta", "Ventas mas rentables", "Ventas menos rentables"), **Ventas** (tabla "Balance por venta": Venta, Cliente, Venta, Costos proveedor, Envio, Ganancia neta, Margen %), **Gastos** (la misma lista de Gastos, sin botón de crear), **Cuentas** (tabla "Cuentas y balance": Cuenta, Saldo inicial, Ingresos, Gastos, Movimientos, Balance, Saldo al cierre; debajo, la tarjeta **Aportes del dueño**: cada mes con su total y número de gastos; al tocar el mes se abren sus gastos con fecha, categoría, nota y monto). Tarjetas: Ventas, Costos, Gastos, Ganancias. La tarjeta **Gastos** muestra el total del mes sin los retiros del dueño y debajo la línea "Nómina pagada: $X · Retiros del dueño: $Y" (retiros = pagos de Nómina a quien tiene la ficha de dueño en Equipo). **Ganancias** = ventas − costos − gastos, y ya no resta los retiros del dueño (misma cifra que `listar_gastos`).
**Botones y acciones:**
- **Asignar cuenta a los fletes**: enlace en el aviso amarillo de "Dinero hoy" cuando hay fletes sin cuenta; abre `/admin/balances/fletes-sin-cuenta`.
- Pestaña Cuentas, en cada fila: ícono ojo (aria-label "Ver transacciones de …") abre la cuenta; ícono lápiz (aria-label "Editar …") abre el modal **Editar cuenta** (Nombre, Tipo, Numero / referencia, Saldo inicial, **Cuenta activa**) → **Guardar cambios** / **Cancelar**.
- Aquí NO hay botón de movimiento manual ni de "Nueva cuenta" (están en `/admin/configuracion/cuentas`).

## /admin/balances/cuentas/[accountId]
Historial de una cuenta: todo lo que entró y salió, con saldo corrido.
**Qué se ve:** nombre y tipo de la cuenta; selector **Periodo** ("Todos los meses" o un mes; por defecto el actual); tarjetas Saldo inicial, Ingresos, Gastos, Balance; recuadro **Revisión del saldo** (punto más bajo, primer día en negativo, "Salidas que quizá no salieron de aquí"); tabla **Transacciones** (Fecha, Concepto, Tipo, Referencia, Monto, Saldo) con buscador "Buscar transacción".
**Botones y acciones:**
- Clic en una fila abre el **Detalle de transacción**: se puede cambiar la fecha y aparece **Guardar** (si es un abono o gasto movido a un día anterior pide el motivo "Fecha anterior a hoy: ¿por qué se registra tarde?"); ver el comprobante si existe; **Cerrar**.

## /admin/balances/fletes-sin-cuenta
Fletes viejos que no restan de ninguna cuenta; se les asigna cuenta o se enlazan con un pago ya hecho a la transportadora.
**Qué se ve:** título **Fletes sin cuenta**, lista de fletes (transportadora, monto, fecha, venta, orden, cliente) con casilla para marcar; debajo de cada uno, "Pagos en Proveedores que podrían ser este flete". Enlaces **Volver a Balances** y **Ver orden**.
**Botones y acciones:**
- **Ya está pagado en Proveedores**: enlaza el flete con ese pago a proveedora (no se resta dos veces).
- Marcar fletes + elegir en **Cuenta de donde salió la plata** ("Elige la cuenta") + **Asignar cuenta a los marcados**: les pone esa cuenta.

## /admin/configuracion/cuentas
Crear/editar cuentas de dinero y registrar movimientos manuales (entrada, salida, traslado).
**Qué se ve:** pestañas de Configuración (pestaña **Cuentas**); bloque "Cuentas" con la misma tabla "Cuentas y balance" de Balances (fila: ojo = ver transacciones, lápiz = editar).
**Botones y acciones:**
- **Movimiento**: abre el modal **Movimiento de cuenta**. Campos: **Tipo** = `Ingreso manual` / `Retiro / salida manual` / `Traslado entre cuentas`; Fecha; **Cuenta** (en traslado se llama **Cuenta origen** y aparece **Cuenta destino**); Monto; Nota. Botones **Registrar movimiento** / **Cancelar**.
- **Nueva cuenta**: modal **Nueva cuenta** (Nombre, Tipo: Efectivo / Caja, Billetera (Nequi, Daviplata), Banco, Otro; Numero / referencia; Saldo inicial) → **Crear cuenta** / **Cancelar**.
- Lápiz de la fila → **Editar cuenta** → **Guardar cambios** (incluye la casilla **Cuenta activa** para desactivarla).

## /admin/proveedores
Lista de proveedores (fábricas y transportadoras) con su saldo (lo que se les debe).
**Qué se ve:** tabla con columnas Proveedor, Correo, Telefono, Productos, Saldo; buscador "Buscar por proveedor, correo o telefono". Clic en la fila abre `/admin/proveedores/<id>/cuenta`.
**Botones y acciones:**
- **Nuevo proveedor**: modal (Proveedor, Nombre, Tipo de proveedor: Fabricante / Envios, Correo, Telefono) → **Guardar proveedor**.
- Menú de fila (ícono "…", aria-label "Acciones de …"):
  - **Transacciones**: abre la cuenta del proveedor (`/admin/proveedores/<id>/cuenta`), donde se paga.
  - **Balance**: abre en otra pestaña el enlace público `/proveedores/<token>` (solo si tiene token).
  - **Editar**: modal **Editar proveedor** → **Guardar cambios**.
  - **Eliminar**: confirma en "Eliminar proveedor" → **Eliminar** / **Cancelar**. Si la proveedora tiene cuenta corriente (cargos o abonos) u órdenes de fabricación (OF), no deja y dice "Esta proveedora tiene cuenta corriente u órdenes de fabricación: no se puede eliminar. Desactívala."

## /admin/proveedores/[supplierId]
Resumen por mes de lo que se le ha encargado a un proveedor (solo lectura).
**Qué se ve:** nombre; tarjetas Total, En fabricacion, Terminados, Pagados, Saldo pendiente; tabla Fecha, Cant, Orden (enlace a la orden), Producto, Precio, Estado (Terminado / En fabricacion), Pago (Pagado / Pendiente).
**Botones y acciones:**
- **Copiar link**: copia el enlace público del balance del proveedor.
- Selector de mes (aria-label "Mes"): cambia el mes mostrado.

## /admin/proveedores/[supplierId]/cuenta
Cuenta corriente del proveedor: cargos (lo que le debemos) y abonos (pagos). Aquí se paga a una proveedora.
**Qué se ve:** título **Transacciones**, nombre del proveedor con lápiz (aria-label "Editar proveedor") y el **Saldo** grande (rojo si se le debe). Tabla **Movimientos** (Fecha, Tipo = Cargo/Abono + código de orden, Detalle, Registrado por, comprobante, Monto) con buscador "Buscar movimiento" y filtro "Rango de fechas". Clic en una fila de orden abre "Movimientos de la orden" (Cargos, Abonos, Saldo).
**Botones y acciones:**
- Botón de menú junto a los filtros (ícono, aria-label "Acciones"):
  - **Balance**: abre el enlace público del proveedor.
  - **Registrar movimiento**: abre el diálogo de pago. Pide: **Foto** del comprobante (obligatoria), Fecha del pago, **Cuenta** de donde sale, Referencia (nota). En "Órdenes y cargos a pagar" se pulsa **Agregar línea** → diálogo **Agregar línea**: **Orden o cargo** (opción `Abono general`, o una orden/cargo con su saldo pendiente) y el monto (se precarga lo pendiente) → **Guardar línea** / **Cancelar**. Se pueden poner varias líneas (clic en una para **Editar línea**; papelera "Quitar línea N"). Abajo: Debe seleccionado, Total a pagar, Queda pendiente → **Registrar pago** (activo solo con foto, cuenta y monto > 0, sin pasarse del saldo).
  - **Registro manual**: diálogo para anotar una deuda que no viene de una orden (comprobante opcional, Fecha del cargo, Monto, Nota "Detalle del cargo") → **Registrar cargo**.
- Papelera de la fila (aria-label "Anular abono" / "Anular cargo"): abre "Anular abono" / "Anular cargo", pide **Motivo** y se confirma con **Anular abono** / **Anular cargo**. Queda una copia con el motivo. Un cargo con abonos no se anula ("Primero anula los abonos"). Los cargos de orden no se anulan aquí.
- Lápiz junto al nombre: modal **Editar proveedor**.

## /admin/gastos
Gastos operativos (nómina, marketing, arriendo, etc.) por cuenta y categoría.
**Qué se ve:** pestañas **Gastos** y **Categorias**. Tarjetas Gasto del mes, Gasto del dia, Categoria principal, Categorias. Pestaña Gastos: tabla (Fecha, Categoria, Detalle, Monto) con buscador "Buscar gasto", filtro de categoría ("Todas las categorias"), "Rango de fechas" (por defecto el mes en curso) y panel "Gasto por categoria". Pestaña Categorias: tabla "Categorias de gasto" (Categoria, Gastos, Total acumulado).
**Botones y acciones:**
- **Nuevo gasto** (pestaña Gastos): modal **Nuevo gasto**: **Foto** del comprobante (obligatoria salvo que la cuenta sea efectivo), Monto, Fecha (si es anterior a hoy pide motivo), **Categoria**, **Cuenta**, **Empleado** (solo si la categoría es Nómina), Descripcion (opcional) → **Registrar gasto** / **Cancelar**. Si faltan categorías o cuentas sale un aviso con **Entendido**.
- Clic en una fila → diálogo **Acciones del gasto**: **Ver comprobante**, **Editar** (modal **Editar gasto** → **Guardar cambios**; en la foto: **Ver** / **Quitar**), **Anular** (abre "Anular gasto" con el campo **Motivo**, obligatorio → **Anular gasto** / **Volver**).
- **Nueva categoria** (pestaña Categorias): Nombre, Descripcion (opcional), casilla **Categoria activa** al editar → **Crear categoria** / **Guardar cambios**. Por fila: lápiz "Editar categoria", papelera "Eliminar categoria" (solo si no tiene gastos).

## /admin/comisiones
Comisión de cada asesora en el mes (15% de la ganancia de cada venta pagada).
**Qué se ve:** título "Comisiones · <mes>"; tarjetas Comisiones del mes, Ventas que cuentan, Valor vendido, Ganancia; avisos (ventas "Falta entregar", cotizaciones de admin, ventas sin asignar). Tabla **Resumen por asesora** (Asesora, # Ventas, Valor vendido, Ganancia, Comisión; el nombre lleva a su detalle). Luego una tabla por asesora (Venta, Cuenta desde, Cliente, Valor, Ganancia, Comisión) y la sección **Sin asignar**.
**Botones y acciones:**
- Flechas "Mes anterior" / "Mes siguiente"; selector de mes + **Ver**; **Mes actual** (si no es el actual).
- **Nómina y pagos**: abre `/admin/comisiones/nomina` del mismo mes.

## /admin/comisiones/nomina
Nómina del mes por persona: básico + comisiones − lo pagado; y registrar pagos.
**Qué se ve:** título "Nómina · <mes>" (enlace **Comisiones**); franja **Dinero hoy**; tarjetas Básicos del mes, Comisiones del mes, Total nómina, Ya pagado, Falta pagar; avisos (falta TRM/días, falta más plata de la disponible). Una tarjeta por persona: Falta pagar, Básico del mes, Comisión, Total del mes, Ya pagado, y tabla de pagos (Fecha, Concepto, Cuenta, Valor).
**Botones y acciones:**
- Flechas de mes, selector + **Ver**, **Mes actual**.
- **Guardar TRM**: guarda los pesos por dólar (para básicos en USD).
- **Guardar días**: días trabajados del mes (solo quien cobra por día).
- **Registrar pago** (desplegable de cada persona): Valor (precarga lo que falta), Concepto (Básico 1ª quincena, Básico 2ª quincena, Días trabajados, Comisiones, Básico + comisiones, Otro), **Sale de la cuenta**, Fecha del pago, Nota (opcional), Comprobante (obligatorio salvo efectivo) → botón **Registrar pago**. Se guarda como gasto de Nómina desde esa cuenta.
- **Editar salario** / **Configurar salario** (desplegable): Tipo de básico (Por quincena / Por día trabajado / Sin básico (solo comisión)), Moneda del básico, Valor por quincena o por día, **Gana comisión por ventas**, Comisión fija %, Comisión fija desde el mes → **Guardar salario**. **Quitar de la nómina** saca a la persona.
- **Crear link** / **Copiar**: link privado `/mis-comisiones/...` de la asesora para enviarle por WhatsApp.
- **Ver su ficha en Equipo**: para fichas sin usuario (sin formulario de pago).
- **Agregar persona a la nómina** (desplegable al final): Persona + mismos campos → **Guardar salario**.

## /admin/productos
Catálogo: buscar, filtrar, crear, editar y borrar productos; importar/exportar CSV y traer fotos de Drive.

**Qué se ve:** si hay combos sin piezas (código CMB o nombre con "combo"/"kit" y sin marcar como combo o con menos de 2 piezas), recuadro ámbar **Combos sin piezas (N)** con código, nombre y enlace **Completar** (abre `/admin/productos/<id>`). Desplegable **Traer fotos de Drive (varios productos)** (códigos separados por coma, máx. 10; botón **Traer de Drive**). Barra con buscador "Buscar por nombre, codigo, categoria o proveedor", botón rojo con el número de productos bajo el margen mínimo (title "Productos por debajo del margen minimo"), selector de precio (Detal / Por mayor), filtro de categoría ("Categorias"), limpiar filtros y vista Cuadricula / Tabla. En tabla: columnas Producto, Categoria, Costo, Precio (o Precio mayor), Margen y menú "⋯". Paginación **Anterior** / **Siguiente**.

**Botones y acciones:**
- Menú de importar/exportar (aria-label "Opciones de importacion y exportacion"): **Importar CSV** (diálogo con columnas esperadas y botón **Importar por CSV**) y **Exportar CSV** (diálogo con **Exportar CSV**; **Cerrar**).
- **Nuevo producto**: abre el diálogo "Nuevo producto" con el mismo formulario de `/admin/productos/new`.
- Menú "⋯" de cada fila: **Editar** (abre el producto en un diálogo con el formulario de edición; el enlace es `/admin/productos/<id>`) y **Eliminar** (confirmación con **Cancelar** / **Eliminar**). Si el producto tiene movimientos de inventario, no deja y dice "Este producto tiene movimientos de inventario: no se puede eliminar. Ocúltalo de la tienda."

## /admin/productos/new
Crea un producto ("Define costo, porcentaje y precio final comercial antes de guardar el producto.").

**Qué se ve:** formulario por pasos: **Producto**, **Precios y compra**, **Inventario**.
- Producto: fotos, Nombre (se pone en mayúsculas), Codigo * (2–3 letras + 3 números, ej. CAM001), Categoria, Descripcion, campos SEO y la casilla de combo.
- Precios y compra: costo, Precio final, % Detal; casilla **Habilitar venta por mayor** (Precio final mayor, % Mayor, Min. unidades mayor); proveedores (si es combo: "Este producto es un combo: los proveedores se toman de cada componente.").
- Inventario: Stock minimo y Envio adicional (COP) ("Vacio = el de la categoria").

**Botones y acciones:**
- Casilla **Habilitar combo (se arma con otros productos)** (paso Producto): marca el producto como combo (`isBundle`). Muestra "Componentes" con **Agregar componente**; cada fila tiene Producto (buscador), Cantidad, papelera "Quitar componente" y "Alternas (si no hay esta pieza, sale otra)" con el buscador "Agregar alterna". Sin filas: "Sin componentes. Agrega al menos un producto."
- **Siguiente** / **← Atras** / **Cancelar**.
- **Guardar producto** (aparece desde el paso 2): crea el producto. Si el código empieza por CMB o el nombre tiene "combo" o "kit" y no está marcado como combo con al menos 2 piezas, no guarda y dice "Este producto es un combo: agrega sus piezas antes de guardar." (también al editar).

## /admin/productos/[productId]
Ficha de edición de un producto.

**Qué se ve:** título con el nombre; botón **Traer de Drive** (fotos de Drive para este producto). Sección "Fotos (n)" para ordenar (arrastrar o flechas; la portada va primera). Sección "Ficha técnica" (Imagen de la ficha, enlace o id de Drive opcional). Tarjeta "Partes de color" (solo Admin). Formulario por pasos **Producto**, **Precios y compra**, **Inventario**, **Actividad**. En Producto, igual que al crear más la casilla **Ocultar de la tienda principal**. Inventario: Stock minimo, Envio adicional (COP), Precio normal (COP), Oferta: precio (COP), Oferta desde/hasta y "Compras en inventario". Actividad: bitácora del producto.

**Botones y acciones:**
- **Guardar fotos** / **Deshacer cambios** (galería; al quitar una foto pregunta "¿Quitar esta foto del producto?" **Si, quitar** / **No**).
- **Agregar ficha**: sube la imagen de la ficha técnica.
- Tarjeta **Partes de color** (debajo de la ficha técnica, solo Admin): **Usar las de la categoría** muestra la plantilla de la categoría sin poder cambiarla; **Partes propias** copia la plantilla para cambiarla solo en este producto, con **Agregar parte**, **Quitar** y **Guardar partes** (igual que en Categorías, con **Recargo $**, "Colores comunes" y el color #RRGGBB de cada acabado). Volver a **Usar las de la categoría** borra las partes propias (pregunta "El producto perderá sus partes propias y usará las de la categoría. ¿Seguir?").
- En la misma tarjeta, enlace **Máscaras de color (N de M)** (N = partes con máscara): abre `/admin/productos/[productId]/mascaras`. Guardar las partes conserva la máscara de cada parte que sigue con el mismo nombre.
- **Habilitar combo (se arma con otros productos)** + **Agregar componente**: igual que al crear.
- **Siguiente** / **← Atras** / **Cancelar** (vuelve a `/admin/productos`).
- **Guardar cambios** (pasos 2 y 3): guarda el producto.

## /admin
Inicio del panel ("Panel de Administración"). Solo para usuarios Admin.
**Qué se ve:** "Bienvenido, <nombre>. Gestiona los módulos de tu sistema desde aquí."; si el rol tiene acceso a Órdenes, la tarjeta **Seguimiento de entregas y fabricaciones** ("Despachos y órdenes de fabricación (OF) de las órdenes abiertas."): cuatro contadores **Atrasados**, **Por vencer hoy**, **En camino** y **Sin fecha** (cada despacho y cada OF cuenta por separado), y una lista de hasta 10 pendientes, el más atrasado primero, con código de la orden, cliente, qué es ("Despacho · <transportadora>" u "OF · <proveedora>") y el chip de estado con los días, como en la lista de órdenes ("lleva N días de atraso", "venció ayer", "vence hoy", "Sin fecha", "En camino · …"); con más sale "Se muestran 10 de N."; sin pendientes, "No hay entregas ni fabricaciones pendientes.". Debajo, el bloque plegable **Cumplimiento últimos 90 días** ("Por fecha real. En un envío con varios tramos solo se mide la transportadora principal.") con dos tablas, **Fabricación** y **Transportadoras**: Proveedor, Entregas, A tiempo, Tarde, % cumplimiento y Atraso promedio, el peor cumplimiento primero; sin datos dice "Aún no hay entregas con fecha estimada". Si la consulta falla, el panel sale sin la tarjeta. Luego, tarjetas de acceso rápido (solo las que el rol puede ver): Configuración, Productos, Cotizaciones, Ventas, Balances, Ordenes, Produccion y Despachos. El resto de módulos está en el menú lateral.
**Botones y acciones:**
- Clic en una tarjeta: abre ese módulo (por ejemplo `/admin/ventas`).
- Clic en una fila de la lista de seguimiento: abre esa orden (`/admin/ordenes/<id>`).

## /admin/categorias
Categorías del catálogo de la tienda.
**Qué se ve:** tabla Categoria, Productos y Acciones, con buscador "Buscar categoria".
**Botones y acciones:**
- **Nueva categoria**: Nombre, Envio adicional (COP) ("vacio = se cotiza"), Logo (opcional), Descripcion de categoria, SEO title y SEO description → **Guardar categoria**.
- Lápiz "Editar <categoría>": los mismos campos → **Guardar cambios**.
- En el mismo diálogo de editar (solo Admin), tarjeta **Partes de color**: la plantilla de partes con color propio para los productos de la categoría. **Agregar parte** (Nombre, ej. Tapizado; Tipo **Carta de colores** o **Acabados**), **Quitar** y **Guardar partes**. Con Carta de colores se marcan los materiales de la carta del CRM (si el CRM no responde: "La carta de colores del CRM no respondió"); con Acabados se escriben separados por comas (ej. Cromada, Dorada, Negra). Junto a cada acabado hay un selector de color y una caja con el código (#RRGGBB) que pinta la vista previa; vacío = el de fábrica (Blanco #F2F2F2, Negro #1C1C1C, Dorado #C9A24A, Cromado dorado #D4B26A, Cromado/Cromada #C0C0C0); un código mal escrito sale "El color del acabado va como #RRGGBB". Junto a cada material marcado y cada acabado hay un campo **Recargo $** (vacío = sin recargo; solo sale como aviso en la cotización, no cambia precios), y en las partes de Carta el campo "Colores comunes (salen primero)", código o nombre separados por comas (ej. Lila, Negro, Beige).
- Papelera "Eliminar <categoría>": borra la categoría.

## /admin/clientes
Directorio de clientes ("Se crean automaticamente al cotizar o manualmente aqui.").
**Qué se ve:** tabla Cliente, Documento, Telefono, Ciudad, Cotizaciones y Alta, con buscador "Buscar por nombre, correo, documento o telefono". Las filas no tienen menú de acciones.
**Botones y acciones:**
- **Crear cliente**: Nombre, Documento ("Cedula / NIT (opcional)"), Correo (opcional), Telefono, Direccion, Barrio, Departamento y Ciudad → **Guardar cliente**.

## /admin/configuracion
Menú de configuración ("Elige el apartado que quieres administrar.").
**Qué se ve:** tarjetas **Usuarios** (`/admin/configuracion/usuarios`), **Configuracion negocio** (`/admin/configuracion/negocio`), **Control de modulos** (`/admin/configuracion/permisos`) y **Cierre de mes** (`/admin/configuracion/cierre-mes`), según los permisos. Dentro de cada apartado hay pestañas: **Negocio**, **Empleados**, **Cuentas** (`/admin/configuracion/cuentas`), **Regla inicial** y **Actividad**.

## /admin/configuracion/actividad
"Actividad de empleados": registro de creaciones, actualizaciones y eliminaciones de cada usuario (la bitácora).
**Qué se ve:** filtros **Todos los empleados**, **Todas las acciones** (Creó / Actualizó / Eliminó), **Todos los modulos** (Producto, Cotizacion, Orden, Venta, Gasto, Inventario, Compra, Categoria, Proveedor, Cuenta, Equipo, Asistencia, Acceso a dudas…) → **Filtrar**. Tabla de movimientos con **Anterior** / **Siguiente**.

## /admin/configuracion/cierre-mes
Cierre de mes: "Genera el informe de ventas y ganancia de un mes y envialo por correo."
**Qué se ve:** formulario con **Mes a cerrar** y **Destinatarios** (correos separados por coma o salto de línea). Lista "Cierres generados" (cada uno abre su detalle).
**Botones y acciones:**
- **Generar y enviar** (mientras trabaja: **Generando y enviando...**): congela las cifras del mes y manda el correo.

## /admin/configuracion/cierre-mes/[closureId]
Detalle de un cierre guardado ("Cierre de <mes>").
**Qué se ve:** tarjetas Ventas del mes, Costos directos ("Proveedores y envio"), Gastos operativos ("Nomina, marketing y varios") y Ganancia neta. "Desglose": Ventas totales, Costo de proveedores, Costo de envios, Gastos operativos y Ganancia neta; "Enviado a: …".
**Botones y acciones:**
- **Volver a cierres**. No se edita: es una foto congelada.

## /admin/configuracion/negocio
Datos del negocio y de la tienda.
**Qué se ve y botones:**
- "Identidad": Nombre de la marca, Moneda activa, Número de WhatsApp y Color primario; cada campo se guarda con su botón de ícono (**Guardar marca**, **Guardar moneda**, **Guardar WhatsApp**, **Guardar color**).
- "Topes tributarios (DIAN)": Valor de la UVT → **Guardar UVT**; medidores de los topes de IVA y renta sobre las ventas del año.
- "Portada del sitio": logo → **Guardar logo**; Título principal del home y Descripción principal del home → **Guardar portada**.
- "Franja promocional": mensajes de la tienda; **Agregar texto**, papelera "Eliminar mensaje N" y el botón **Guardar franja promocional**.

## /admin/configuracion/permisos
"Control de modulos por rol": qué módulos ve cada rol (Admin, Empleado, Cliente).
**Qué se ve:** una tarjeta por rol con sus módulos activos.
**Botones y acciones:**
- **Configurar rol**: abre la lista de módulos con casillas → **Guardar permisos** / **Cancelar**. A un Admin no se le puede quitar el Control de módulos.

## /admin/configuracion/reglas
"Regla inicial": margen mínimo permitido.
**Qué se ve:** Margen minimo al Detal (%) y Margen minimo al por mayor (%). Si un producto queda por debajo, se resalta en rojo en `/admin/productos`.
**Botones y acciones:**
- **Guardar reglas**.

## /admin/configuracion/usuarios
Usuarios del equipo (Admin y Empleado).
**Qué se ve:** tabla Usuario, Alta, Rol actual, Rol y Accion; buscador "Buscar por nombre o correo"; **Anterior** / **Siguiente**.
**Botones y acciones:**
- **Crear usuario**: nombre, correo y rol (ADMIN / EMPLEADO) → **Enviar invitacion** (llega un correo para que la persona cree su contraseña).
- Columna Rol: elegir ADMIN / EMPLEADO / CLIENTE → **Aplicar**.
- Menú "Mas acciones" de la fila: **Editar modulos** (solo Empleado: casillas de módulos → **Guardar acceso**) y **Eliminar usuario** (confirma con **Eliminar** / **Cancelar**).

## /admin/dudas
Dudas del catálogo: preguntas sobre productos que responden las asesoras en `magilus.com/dudas` con su nombre y un código.
**Qué se ve:** "Crear acceso"; tabla "Accesos" (Nombre, Creado, Último uso, Estado); "Resumen: N respondidas, N pendientes" por grupo ("Faltan N" o "Completo"); tabla "Respuestas" (Pregunta, Respuesta, Quién, Cuándo; las viejas en gris, la última es la vigente).
**Botones y acciones:**
- **Crear código** (Nombre de la persona): muestra el código **solo esta vez**, con **Copiar código** y **Copiar mensaje para WhatsApp**.
- **Desactivar** (por acceso): esa persona ya no puede entrar.
- **Exportar CSV** (`/admin/dudas/export`): todas las respuestas.

## /admin/equipo
Ficha de cada trabajador (solo dueño/admin, permiso de Equipo).
**Qué se ve:** filtros **Activos**, **Retirados** y **Todos** (con su número), buscador "Buscar por nombre", **Toda forma de pago** y **Filtrar**; una tarjeta por persona (cargo, vinculación, forma de pago, ingreso, salida). Enlace a **Nómina**.
**Botones y acciones:**
- **Agregar trabajador** (abajo): Datos personales (Nombre completo, Cédula, Fecha de nacimiento, Celular, Correo, Dirección, contacto de emergencia), Trabajo (Cargo, Tipo de vinculación, Forma de pago, Usuario en Gestión, Es el dueño), Fechas (Fecha de ingreso, Fecha de salida, Motivo de salida) y Notas → **Crear ficha**.
- En cada tarjeta: **Editar ficha** → **Guardar ficha**; **Dar de baja** (Último día trabajado y Motivo → **Dar de baja**); si ya tiene salida: **Reactivar (volvió)** o **Quitar fecha de salida**.

## /admin/inventario
Stock por producto y movimientos de inventario.
**Qué se ve:** tarjetas Productos en stock, Unidades totales, Valor inventario y Agotados. Pestañas **Stock** y **Movimientos**. Stock: buscador "Buscar producto", **Mostrar agotados** / **Ocultar agotados**, vista Cuadricula o Tabla (Producto, Stock, Minimo, Estado: Disponible / Bajo stock / Agotado, Ultimo movimiento). Movimientos: tabla Fecha, Producto, Tipo (Entrada / Salida / Ajuste), Cambio, Orden (código `COM-...` de la compra o de la orden) y Nota, con buscador "Buscar movimiento".
**Botones y acciones:**
- **Nuevo movimiento** y **Mover** (en cada producto): abren "Nuevo Inventario" con "Genera el inventario con Orden de Comprar" y el botón **Ir a Ordenes**. La **compra directa** a proveedor se hace en `/admin/ordenes` → **Nuevo** → **Registrar compra** (ver esa pantalla); se edita o anula desde el menú de la orden (**Editar compra** / **Anular compra**).
- Lápiz "Editar stock minimo" → Cantidad minima → **Guardar**.
- Menú "Acciones" de cada movimiento: **Editar** (Tipo: Entrada (sumar) / Salida (restar) / Ajuste (conteo), Cant, Fecha, Nota → **Guardar cambios**) y **Anular** (abre "Anular movimiento", pide **Motivo** y se confirma con **Anular movimiento**; el stock se recalcula, sus cargos a la proveedora se anulan con él y queda una copia con el motivo. Si esos cargos tienen abonos, no deja: "Primero anula los abonos").
- **Lotes**: abre `/admin/inventario/lotes` (compras por lote a proveedora).

## /admin/inventario/lotes
"Lotes de compra": compras a proveedora registradas con **Pendientes por fabricar** (en Registrar compra), una tarjeta por producto de cada compra.
**Qué se ve:** arriba la línea "Cali: N · Taller proveedora: N · Fabricando: N · Pendientes: N" (unidades que aún no salieron en venta). Por lote: código de la compra (`COM-...`, abre la orden) y su `ORD-...`, producto · proveedora, "cantidad × costo por unidad = total" y "Pagado X · Saldo Y" (cargos y abonos de esa compra). Por unidad: su estado ("Pendiente", "Fabricando · Negro", "En inventario · Cali", "Vendida" con su orden). Sin lotes: "Todavía no hay compras por lote...". Botón **Inventario** para volver.
**Botones y acciones** (solo ADMIN; cada unidad muestra solo los que valen para su estado):
- Pendiente → **Pasar a fabricar**: pide **Color** (obligatorio) → **Pasar a fabricar**.
- Fabricando → **Llegó**: pide **Ubicación** (Cali / Taller proveedora) → **Guardar llegada**. Suma 1 al stock (un combo, sus piezas) con la nota "Compra COM-... (llegó unidad del lote)"; no crea deuda nueva con la proveedora.
- Fabricando o En inventario → **Editar color** → **Guardar color**.
- En inventario → **Cambiar ubicación** → **Guardar ubicación**.
- En inventario → **Salió en venta**: elige la **Orden de venta** (primero las que traen ese producto) → **Marcar como vendida**. Es solo la marca: el stock baja al confirmar la pieza en la orden, que debe ir en modo Stock para no volver a cargarle a la proveedora.
- En todos los diálogos, **Cancelar** cierra sin cambiar nada.

## /admin/marketplace
Monitoreo del canal Facebook Marketplace (NETMAGI). Solo lectura.
**Qué se ve:** arriba "¿Está publicando bien hoy?" con tarjetas de hoy contra ayer y el promedio de 7 días; "Cuentas" (Publica / En pausa); "Anuncios" (Fecha, Cuenta, Ciudad, Producto, Precio, Estado, Clientes y Facebook); "Por ciudad"; gráfico "Clientes nuevos y anuncios publicados por día (últimos 30 días)"; "Qué funciona" (fórmulas de título, Mejores categorías, Mejores productos). Plegado: "Más detalle: ventas del canal, cuentas, productos y publicador".
**Botones y acciones:**
- **Actualizar** (se actualiza solo cada 2 minutos) y periodo **7 días** / **30 días** / **90 días**.
- Anuncios: filtros Desde, Hasta, Cuenta, Ciudad, Estado y "Buscar código o nombre"; **Quitar filtros**; **Exportar CSV**; **Ver en Facebook** en cada anuncio.
- "Qué funciona" (etiqueta "Fórmula de venta") es solo lectura; dentro de "Más detalle" hay otro **Exportar CSV**.

## /admin/productos/[productId]/mascaras
Máscaras de color de un producto (solo Admin). Se llega con el enlace **Máscaras de color** de la tarjeta "Partes de color" de la ficha.

**Qué se ve:** título "Máscaras de color · <producto>" y enlace **Volver a la ficha**. La foto de portada (la primera foto) con la capa de la parte elegida encima en rojo. Si el producto usa las partes de su categoría, aviso amarillo: al guardar la primera máscara se copian como partes propias. Sin portada: "Este producto no tiene foto de portada…" con **Ir a la ficha**; sin partes: "Este producto no tiene partes de color…" con **Ir a la ficha**.

**Botones y acciones:**
- Lista **Parte**: elige qué parte se pinta (dice "(sin máscara)", "(sin guardar)" o ✓).
- **Pincel**: pinta la zona de la parte (con el dedo o el mouse). **Borrador**: la quita.
- **Tamaño (N px)**: grosor del pincel y del borrador.
- **Ver máscara** / **Ver foto**: muestra la máscara sola en blanco y negro o vuelve a la foto.
- **Guardar máscara**: guarda la máscara de la parte elegida (PNG en blanco y negro del tamaño de la portada, máximo 2000 px por lado). Si usaba las partes de la categoría pregunta "…¿Seguir?" antes. Mensajes: "Máscara de Tapizado guardada" o el error ("La máscara no tiene el tamaño de la foto de portada…").

## /admin/productos/fichas
"Fichas técnicas en lote": sube un CSV y las imágenes (cada una llamada como su driveFileId).
**Botones y acciones:**
- Elegir el CSV y las imágenes ("N imagen(es) reconocidas").
- **Revisar (simulación)**: muestra qué se crea, qué ya estaba, sin producto o sin imagen, y "Códigos que no existen".
- **Cargar N ficha(s)** (pide confirmar; mientras carga: "Cargando x/y..."). Se puede repetir sin duplicar.

## /admin/retroactivos
"Registros retroactivos": ventas, abonos y gastos cargados con una fecha anterior al día en que se registraron (hora Colombia).
**Qué se ve:** filtros Mes, Persona (Todas) y Tipo (Todos) → **Filtrar**; resumen por persona (cantidad y monto por tipo); tabla Registrado, Persona, Tipo, Fecha puesta, Días de atraso, Monto, Motivo y Registro.
**Botones y acciones:**
- En Registro: el código de la venta abre `/admin/ventas?q=<código>`; en gastos, **Ver gastos** abre `/admin/gastos`. "Borrado" si el registro ya no existe. Solo lectura.

## /admin/transporte
Tipo de envío por ciudad y corregimiento (DANE).
**Qué se ve:** tarjetas Ciudades con envio gratis, Corregimientos con envio gratis, Pendientes de revisar y Departamentos. Recuadro "Pendientes de revisar (N)" con lo nuevo que manda el CRM (marca **Por revisar**). Buscador "Buscar ciudad o corregimiento..." y lista de departamentos → ciudades → corregimientos (clic para desplegar).
Arriba, botón doble **Lista / Mapa** (abre en **Lista**, la vista de siempre).
**Mapa:** Colombia por municipios pintados según su tipo de envío, con San Andrés y Providencia en un recuadro aparte arriba a la izquierda; los corregimientos con un tipo distinto al de su municipio salen como puntos de su color. Leyenda arriba con cuántos municipios hay de cada tipo: **Gratis** (verde), **Adicional** (azul), **Se cotiza** (amarillo), **No llegamos** (rojo) y, si los hay, "N municipios sin forma en el mapa" (por ejemplo Nuevo Belén de Bajirá). Al tocar un municipio o un punto (o con Tab y Enter) se abre una cajita con el nombre, el departamento y el selector "Tipo de envio"; al elegir, el color y la leyenda cambian al momento y la Lista queda igual al volver. La caja "Contraentrega $" no sale en el mapa: se cambia en la Lista. Botón **X** cierra la cajita. El Mapa se acerca con la rueda del mouse o pellizcando con dos dedos (hacia donde está el puntero) y se mueve arrastrando; si arrastras, al soltar no se abre la cajita. Abajo a la derecha, botones **+** (acercar), **−** (alejar) y **Ver toda Colombia** (vuelve a la vista completa).
El mapa muestra el nombre de cada departamento, las capitales con un punto negro y su nombre (Mitú, Leticia, Bogotá, Riohacha…) y, al acercarse, los nombres de los demás municipios que se ven en pantalla. Los nombres no tapan el toque: debajo se sigue abriendo el municipio.
Arriba del Mapa, buscador **"Buscar municipio, corregimiento o departamento"** (sin tildes ni mayúsculas; "cali", "bogota" van primero, como en la Lista). La lista muestra departamentos, municipios y corregimientos; al elegir uno el mapa se acerca y lo marca con **borde rojo grueso** que parpadea unos 3 segundos y queda fijo hasta cerrar la cajita (o tocar otro lugar). **Municipio:** se acerca a él y abre la cajita de siempre con su tipo. **Corregimiento:** va a su punto con un anillo rojo o, si no tiene punto en el mapa (los nuevos del CRM o los sin coordenadas, como Cabo de la Vela), a su municipio; la cajita cambia su tipo y guarda igual que en la Lista. **Departamento:** encuadra todos sus municipios y la cajita dice cuántos hay de cada tipo. **Municipio sin forma** (Nuevo Belén de Bajirá): va a su departamento (Chocó) y la cajita muestra su tipo con el aviso "Este municipio no tiene forma en el mapa". Lo de San Andrés se marca en su recuadro. La **X** del buscador lo limpia.
**Botones y acciones:**
- Selector "Tipo de envio" en cada fila: **Automatico (como antes)**, **Gratis**, **Adicional**, **Se cotiza** o **No llegamos**. Se guarda al elegir y quita la marca de pendiente. El valor del envío adicional se pone en la categoría (`/admin/categorias`) o en el producto.
- Caja **"Contraentrega $"** al lado del selector en cada fila (ciudad, corregimiento, búsqueda y pendientes): valor del envío contraentrega del **combo de camillas** (CMB005). Se guarda al salir de la caja o con Enter; acepta "120000", "120.000" o "$ 120.000" y queda como "$ 120.000". **Vacío = se cotiza**; un corregimiento vacío usa el valor de su ciudad. Con letras o decimales sale "Valor no válido" y no se guarda. No aparece en lugares "No llegamos". Las asesoras lo ven en el chat del CRM solo con ese combo.

## /admin/ventas/origen
"Ventas por origen · <año>" (Meta Ads, Marketplace, Referido, Recurrente, Mostrador, Sin dato).
**Qué se ve:** "Total del año" (Origen, # Ventas, Facturación, % fact., Ganancia, Ticket promedio) y "Ventas con origen: N% (meta ≥ 80 %)"; "Por campaña / anuncio" (Anuncio, # Ventas, Facturación, Ganancia, Ticket promedio); una tabla por mes.
**Botones y acciones:**
- **Ventas** (volver), flechas "Año anterior" / "Año siguiente".

## /admin/ventas/retenciones
"Retenciones en la fuente": lo que las empresas clientes retuvieron y pagaron a la DIAN a nombre de Magilus.
**Qué se ve:** Total del mes y Total del año; tabla Fecha, Venta, Cliente, NIT/Cédula, Valor retenido y Certificado.
**Botones y acciones:**
- **Ventas** (volver), flechas "Mes anterior" / "Mes siguiente", **Descargar Excel (CSV)** (`/admin/ventas/retenciones/export?mes=AAAA-MM`).
- La retención se registra como abono en `/admin/ventas` → **Registrar abono** → cuenta "Retención en la fuente".

## Enlaces públicos que usa el equipo
Página de la proveedora `/fabricacion/[token]` (también `/of/<código>`): por cada producto que aún no está despachado, botón verde **Listo para despacho**, que abre "Foto 1: producto empacado, paquete abierto" y "Foto 2: paquete cerrado con la guía" (obligatorias), "Fotos extra (hasta 3)" y el botón **Enviar fotos**. Arriba sale el aviso verde "Fotos del embalaje enviadas" o el rojo con el error ("Este producto ya fue despachado", "Falta la foto 1: …", "Máximo 5 fotos …"). Ya subidas, se ven en "Fotos del embalaje enviadas" con "Subida el <dd/mm/aaaa> a las <hh:mm>" (hora de Colombia) y el botón cambia a **Agregar más fotos** (solo extra); con 5 fotos ya no sale. No cambia el estado de la orden ni avisa a nadie: queda en la bitácora de la orden ("Proveedora subió fotos del embalaje: <producto>").

`/dudas` (asesoras: nombre + código para responder dudas del catálogo) · `/mis-comisiones/[token]` (enlace privado de cada asesora con sus ventas y comisión) · `/gastos/soporte/[token]` (subir la foto de un gasto registrado por Claude, 24 h) · `/proveedores-pago/soporte/[token]` (subir la foto del comprobante de un pago a proveedora registrado por Claude, 24 h).
