# Gestión (Magilus) — notas para el asesor de IA

Este archivo lo lee la herramienta MCP `que_es_esta_aplicacion` para todo lo que **no se puede
sacar del código**. Lo demás (versiones, esquema de base de datos, rutas, módulos, casos de uso,
reglas en código, despliegue y volumen de datos) se genera solo.

Cómo editarlo:
- Respeta los títulos `## ...`: la herramienta organiza la respuesta por esos títulos. Una sección
  nueva con otro título también se muestra (en "otras notas").
- En **Módulos**, **Entidades** y **Pantallas**, cada línea es `- \`nombre\`: descripción`.
- Los cambios se ven después del siguiente despliegue (push a `main`).
- Lo que falte por describir aparece en `pendiente_de_documentar` en la respuesta de la herramienta.

## Qué hace la aplicación

Gestión es la plataforma web de Magilus, un negocio colombiano que fabrica y vende mobiliario
profesional para peluquería, barbería y estética (sillas, camillas, lavacabezas, tocadores,
poltronas, butacos y combos). En una sola aplicación tiene la tienda pública (catálogo, cotización
por WhatsApp, precios al por mayor, cobertura de envío gratis) y el panel interno del negocio:
cotizaciones, ventas y cobros, órdenes de cumplimiento, fabricación con proveedoras, despachos,
inventario, cuentas de dinero, gastos y rentabilidad por venta.

## Problema de negocio que resuelve

Magilus vende sobre pedido: casi todo se fabrica con proveedoras externas después de que el
cliente paga un anticipo. Antes el seguimiento estaba repartido entre WhatsApp, hojas de cálculo y
memoria. Gestión une en un solo lugar el ciclo completo — cotizar, cobrar, encargar a cada
proveedora con su costo, despachar y entregar — y con eso calcula la **ganancia real de cada venta**
(precio menos lo que se le paga a la proveedora menos el flete). Así se sabe cuánto se ganó cada
mes, cuánto se le debe a cada proveedora y qué productos dejan más margen.

## Patrón de arquitectura

Next.js con App Router. Las pantallas son Server Components que leen datos y las escrituras son
Server Actions (`src/app/actions/*.ts`); casi no hay API REST. Una parte del dominio está en
módulos hexagonales `src/modules/<modulo>/{domain,application,infrastructure,presentation}`: el
dominio no conoce Prisma, la aplicación orquesta casos de uso y la infraestructura implementa los
puertos con Prisma. El resto de la lógica (cotizaciones, ventas, órdenes, despachos) todavía vive
en las Server Actions y en `src/lib/`.

## Módulos

- `balances`: rentabilidad por venta, cuentas de dinero, pagos a proveedores, costos de envío y métricas del mes. Es la fuente única del cálculo de ganancia.
- `expenses`: gastos operativos por categoría y cuenta (nómina, marketing, arriendo, servicios, herramientas, varios). También registra gastos dichos a Claude por voz o chat (herramienta MCP `registrar_gasto`): el gasto se guarda al confirmar el dueño (dos pasos: resumen y "sí"); la foto del soporte es opcional, se sube después por un enlace secreto y no se revisa.
- `inventory`: stock por producto, movimientos de entrada/salida/ajuste y compras directas a proveedor (COM-).
- `transporte`: tipo de envío por departamento, ciudad y corregimiento (datos DANE): gratis, adicional, se cotiza o no llegamos. Lo consulta el cliente en `/cobertura` (solo si es gratis o no) y el CRM de las asesoras por `/api/transporte/ubicaciones`.
- `ventas`: reglas de la venta: forma de pago (50/50 o contraentrega), origen de cada venta (lo avisa el CRM por `/api/ventas/origen`; reporte en `/admin/ventas/origen`) y abonos por retención en la fuente (reporte en `/admin/ventas/retenciones`).
- `nomina`: nómina del mes (salario básico de cada persona + comisiones − lo ya pagado) y el dinero de hoy por cuenta. La configuración (básicos, TRM, días trabajados) vive en `AppSetting` (`payrollConfig`); los pagos son gastos de la categoría Nómina.
- `equipo`: ficha de cada trabajador (ingreso, salida, contacto, forma de pago) y las reglas de estado Activo/Retirado, edad y "¿trabajaba en tal fecha?". La nómina, las comisiones y las asignaciones la usan para incluir a los activos y sacar a los retirados.
- `asistencia`: registro de entrada y salida (hora del servidor), correcciones con motivo hechas por un admin, asistencia de hoy y por mes, y los días trabajados del mes que usa la nómina por día desde nov-2026.
- `asesor`: consultas para el asesor de IA (servidor MCP en `/api/mcp`): resumen del mes, ventas, cotizaciones, productos, comisiones, nómina, equipo, asistencia, saldos de cuentas, gastos del mes con la ganancia real (`listar_gastos`), cuánto se le debe a cada proveedora orden por orden (`deuda_con_proveedoras`) y esta radiografía. Es de solo lectura salvo `registrar_gasto` (ver reglas). También alimenta la pantalla de Comisiones del panel (`/admin/comisiones`), con el mismo cálculo.

## Entidades

- `User`: cualquier persona con cuenta: dueño/admin, empleados y clientes (rol `Role`). Los clientes se crean al cotizar. Es el autor de casi todos los registros.
- `ActivityLog`: bitácora de auditoría: quién creó, editó o borró qué.
- `GastoBorrador`: enlace para subir la foto (opcional) de un gasto dicho a Claude. Guarda los datos del gasto, el hash del enlace (nunca el enlace) y el estado (`GastoBorradorEstado`: pendiente, guardado, rechazado, vencido). El `Expense` ya existe desde que el dueño confirma; el enlace dura 24 horas, sirve una vez y al subir la foto se pega a ese gasto y el borrador queda guardado. Los campos de intentos, rechazo y revisión son de la antigua revisión con IA (un enlace viejo, sin gasto, guarda el gasto al recibir la foto).
- `Product`: producto del catálogo con precio de venta, costo de proveedor, flete por unidad, márgenes, precio mayorista, bandera de combo u oculto en tienda y, opcional, su propio envío adicional (COP) que pisa el de la categoría.
- `ProductReview`: reseña o calificación de un producto en la tienda.
- `ProductComponent`: composición de un combo: qué productos hijos y en qué cantidad forman un producto combo.
- `ProductImage`: imágenes ordenadas de un producto.
- `Category`: categoría del catálogo. Guarda el envío adicional (COP) de sus productos; vacío = se cotiza.
- `Supplier`: proveedora: fábrica (`MANUFACTURER`) o transportadora (`SHIPPING`). Tiene enlace de estado de cuenta.
- `SupplierLedgerEntry`: movimiento de la cuenta con una proveedora: cargo (lo que se le debe) o abono (pago). Puede atarse a una venta, orden, producto de orden, despacho o compra de inventario.
- `ProductSupplier`: qué proveedoras fabrican cada producto, a qué costo y cuál es la preferida.
- `AppSetting`: configuración del sistema como clave y valor (moneda, marca, color, WhatsApp, permisos por módulo, etc.).
- `Quote`: cotización (COT-) a un cliente, con enlace para compartir. Puede convertirse en una venta. Guarda el origen del cliente que avisa el CRM al marcar el chat como ganado.
- `Sale`: venta (SAL-) nacida de una cotización. Lleva el total a cobrar, descuento, su estado de pago y el origen (copiado de la cotización; Mostrador en venta directa).
- `ShippingCost`: costo de envío de una venta (transportadora y monto). Resta en la ganancia de esa venta.
- `SalePayment`: anticipo o abono de un cliente a una venta, con método, fecha, comprobante y cuenta que recibe. Si es retención en la fuente (`isWithholding`), no tiene cuenta y puede llevar el número de certificado (`withholdingCertificate`).
- `QuoteItem`: línea de una cotización: producto, cantidad, precio y si sale de stock o se fabrica.
- `Order`: orden (ORD-) de venta (cumplir una venta) o de compra (comprar a una proveedora). Su historial define la fecha de entrega.
- `OrderItem`: producto dentro de una orden, con la proveedora confirmada y el costo real que se le paga.
- `OrderItemPhoto`: foto de evidencia de un producto de una orden (fabricación o estado).
- `ProductionJob`: trabajo de fabricación de un producto de una orden.
- `Dispatch`: despacho o entrega de una orden: tipo de entrega, transportadora, guía, costo de envío y fotos.
- `DispatchItem`: qué productos y cuántas unidades salen en un despacho; reparte el costo del envío.
- `OrderStatusHistory`: cada cambio de estado de una orden; la última entrada a "entregada" es la fecha de entrega.
- `Account`: cuenta de dinero del negocio (efectivo, banco, billetera) con saldo inicial.
- `AccountMovement`: entrada, salida o transferencia manual de dinero en una cuenta.
- `ExpenseCategory`: categoría de gasto operativo.
- `Expense`: gasto operativo pagado desde una cuenta.
- `InventoryMovement`: entrada, salida o ajuste de stock de un producto.
- `MonthClosure`: cierre de mes congelado (ventas, costos, envíos, gastos, utilidad y margen) que se comparte por correo.
- `ManufacturingOrder`: orden de fabricación (OF-) de una proveedora dentro de una orden de venta, con enlace para enviársela, fecha y dirección de entrega.
- `TeamMember`: ficha de un trabajador (Equipo): datos personales, cargo, vinculación, forma de pago, fecha de ingreso, fecha de salida y motivo. Unida opcionalmente (y una sola vez) a su usuario; si se borra el usuario, la ficha queda.
- `AsistenciaMarca`: una marca de entrada o salida de un usuario (Empleado/Admin): hora real del servidor, día en Colombia al que pertenece (el de la entrada), origen (la persona, un admin por ella o una corrección), quién la creó, motivo, la marca que corrige y, si se anuló, quién, cuándo y por qué. Nunca se borra. Un usuario con marcas no se puede borrar.
- `TransportDepartment`: departamento de Colombia (DANE).
- `TransportCity`: municipio de Colombia (DANE), su tipo de envío (gratis, adicional, se cotiza, no llegamos o automático) y si tiene envío gratis.
- `TransportLocality`: corregimiento o centro poblado (DANE), o barrio/vereda que agregó el CRM (queda "pendiente de revisar"), con su tipo de envío; sin tipo propio hereda el de su ciudad.

## Pantallas

- `/`: inicio de la tienda pública: destacados, categorías y promociones.
- `/catalogo`: catálogo completo de productos visibles.
- `/[slug]`: productos de una categoría.
- `/[slug]/[productSlug]`: ficha de un producto con botón para comprar por WhatsApp.
- `/categorias/[slug]`: listado de una categoría (ruta alterna).
- `/productos/[productId]`: ficha de producto por id (ruta alterna).
- `/distribuidor`: lista de precios al por mayor.
- `/cobertura`: el cliente consulta si su ciudad o corregimiento tiene envío gratis; `?ref=1` y `?ref=2` cambian el WhatsApp de la línea de venta.
- `/legal/[slug]`: políticas (privacidad, términos, datos personales, garantía).
- `/cotizaciones/[token]`: cotización compartida con el cliente, con PDF.
- `/sales/[token]`: factura o comprobante de una venta para el cliente.
- `/proveedores/[token]`: estado de cuenta de una proveedora.
- `/fabricacion/[token]`: orden de fabricación para la proveedora: sus productos, medidas, fecha, dirección y costo, sin precio de venta ni datos del cliente.
- `/informe`: informe mensual protegido con token.
- `/login`: inicio de sesión.
- `/register`: registro de clientes.
- `/recuperar`: pedir correo para recuperar la contraseña.
- `/restablecer`: definir una nueva contraseña.
- `/activar`: activar una cuenta invitada y crear la contraseña.
- `/unauthorized`: aviso de que no hay permiso.
- `/profile`: perfil del usuario; el dueño ve "Mi negocio > Equipos" para invitar personas y darles módulos.
- `/empleado`: inicio de un empleado (solo ve los módulos que le asignaron).
- `/cliente`: área del cliente.
- `/admin`: tablero del dueño.
- `/admin/configuracion`: ajustes generales (solo dueño).
- `/admin/configuracion/usuarios`: usuarios del equipo, rol, módulos por persona y eliminar.
- `/admin/configuracion/negocio`: moneda, marca, color, WhatsApp, logo, textos y márgenes mínimos.
- `/admin/configuracion/permisos`: control de módulos por rol (anterior al acceso por persona).
- `/admin/configuracion/cuentas`: cuentas de dinero.
- `/admin/configuracion/reglas`: reglas iniciales del negocio.
- `/admin/configuracion/actividad`: bitácora de actividad.
- `/admin/configuracion/cierre-mes`: cierres de mes generados.
- `/admin/configuracion/cierre-mes/[closureId]`: detalle de un cierre de mes.
- `/admin/productos/new`: crear producto.
- `/admin/productos/[productId]`: editar un producto.
- `/admin/cotizaciones/[quoteId]`: editar una cotización.
- `/admin/comisiones`: comisiones de las asesoras del mes (solo el dueño/admin): resumen por asesora (# ventas, valor vendido, ganancia, comisión), detalle de cada venta con el % aplicado (10/15) y "Falta entregar", y total del mes. Selector de mes (por defecto el actual, hora de Colombia).
- `/mis-comisiones/[token]`: link privado de cada asesora (sin iniciar sesión): sus ventas del mes con la comisión explicada venta por venta, la regla en lenguaje claro y sus cotizaciones abiertas con la comisión aproximada si las cierra. Nunca muestra costos ni fletes. Se crea o cambia desde Nómina (token en `AppSetting.sellerCommissionLinks`).
- `/admin/comisiones/nomina`: nómina del mes (solo el dueño/admin): "Dinero hoy" por cuenta arriba, y por persona el básico del mes, la comisión, el total, lo pagado y lo que falta. Configurar salario (por quincena, por día o sin básico; en COP o USD), TRM, días trabajados y botón "Registrar pago" que crea un gasto de Nómina desde la cuenta elegida.
- `/admin/equipo`: equipo de trabajo (solo el dueño/admin): fichas de Activos / Retirados / Todos, búsqueda por nombre y filtro por forma de pago; crear, editar, dar de baja (fecha de salida + motivo) y reactivar.
- `/admin/asistencia`: asistencia (solo el dueño/admin). Pestaña Hoy: cada trabajador con su estado (trabajando / salió / no ha llegado), entrada, salida y horas, marcar por esa persona y agregar una marca olvidada. Pestaña Por mes (`?vista=mes&mes=AAAA-MM&persona=`): por día entrada, salida, horas, correcciones y motivo, con el total de días y horas; con una persona elegida se corrige o anula cada marca.
- Botón "Marcar entrada / Marcar salida" en la barra superior de todo el panel (Empleado y Admin, celular y PC).
- `/admin/ventas/origen`: ventas por origen (Meta Ads, Marketplace, Referido, Recurrente, Mostrador, Sin dato) por mes y por anuncio, con el criterio de Balances.
- `/admin/ventas/retenciones`: retenciones en la fuente del mes (`?mes=AAAA-MM`): fecha, venta, cliente, NIT/cédula, valor y certificado; total del mes y del año; descarga CSV para la declaración de renta.
- `/admin/ordenes/[orderId]`: detalle de una orden: fabricar, recoger, despachar, entregar, historial, abonos y órdenes de fabricación.
- `/admin/ordenes/[orderId]/ganancia`: desglose de por qué se ganó lo que se ganó en esa orden.
- `/admin/ordenes/[orderId]/editar-compra`: editar una compra directa a proveedor.
- `/admin/proveedores/[supplierId]`: ficha de una proveedora.
- `/admin/proveedores/[supplierId]/cuenta`: cuenta corriente de una proveedora (cargos y abonos).
- `/admin/balances/cuentas/[accountId]`: movimientos de una cuenta de dinero.
- `/admin/productos/export`: descarga el catálogo de productos en CSV.
- `/api/auth/[...nextauth]`: inicio y cierre de sesión (next-auth).
- `/api/generate-quote-pdf`: genera el PDF de una cotización.
- `/api/generate-sale-invoice-pdf`: genera el PDF de la factura o comprobante de una venta.
- `/api/informe`: informe mensual en JSON (con token).
- `/api/informe/link`: entrega al dueño el enlace del informe con su token.
- `/api/mcp`: servidor MCP de solo lectura del asesor de IA (llave en header).
- `/api/mcp/[key]`: el mismo servidor MCP con la llave dentro de la ruta (conectores de claude.ai).
- `/api/ventas/origen`: para el CRM (con llave). POST avisa de dónde vino el cliente de una cotización (al marcar el chat como ganado); se guarda en la cotización y en su venta.
- `/api/transporte/ubicaciones`: para el CRM (con llave). GET busca ciudades y corregimientos sin importar acentos, dice su tipo de envío y, si se manda un producto, el total con envío. POST agrega un corregimiento o barrio nuevo bajo una ciudad sin duplicar.
- `/uploads/[...path]`: sirve los archivos subidos (comprobantes, imágenes).
- `/verify-email`: confirma el correo de un usuario desde el enlace enviado.

## Reglas de negocio

**Ganancia de una venta.** Ganancia = valor de la venta − costo de los productos − fletes de envío
de esa venta. El costo de cada producto vendido es, en este orden: el costo confirmado con la
proveedora en la orden; si no hay y el producto sale de stock, costo de catálogo + flete por unidad;
si no, el costo de la proveedora preferida o el costo de catálogo. No resta gastos operativos.

**Cuándo cuenta una venta.** Cuenta cuando está pagada por completo (estado "facturada": lo pagado
≥ total), aunque falte entregarla: el recaudo y la entrega son cosas distintas (decisión de
Alexander, 11-oct-2026). Se reconoce en la fecha del pago que la completó, y no cambia de mes cuando
luego se entrega. Mientras no se entrega aparece como "Falta entregar". Excepción: la
**contraentrega** se cobra al entregar, así que solo cuenta con la orden entregada y en el mes de la
entrega. Una orden cancelada no cuenta.

**Editar o anular una compra.** Editar una compra actualiza la misma orden: conserva su número
ORD, su COM, su estado, sus despachos y sus pagos a la proveedora; el stock solo cambia por la
diferencia de unidades. No se quita una línea despachada o con pagos. Una compra con pagos no se
borra: solo se anula, con motivo; anularla no toca stock, cargos ni pagos.

**Gastos por voz o chat (`registrar_gasto`).** Claude repite el gasto y espera el "sí" del dueño; con
con el "sí" (`confirmado=true`, una sola vez) el gasto **queda guardado de una vez**, sin foto, y la
respuesta trae su número y un enlace opcional para subir la foto después (24 horas, un solo uso). La
foto es opcional y **no se revisa**: se pega al gasto ya guardado (solo JPG, PNG, WEBP o PDF de hasta
12 MB); si no se sube, el gasto sigue guardado. No hace falta `ANTHROPIC_API_KEY`. Si Claude confirma
dos veces el mismo gasto quedan dos: el repetido se borra desde la pantalla de Gastos. Tope de $20.000.000 por gasto;
nómina exige persona; una fecha anterior a hoy exige motivo (gasto retroactivo). El gasto queda a nombre
de `MCP_GASTOS_USUARIO_EMAIL` o, si no existe, del administrador más antiguo, y usa el mismo guardado
que la pantalla de Gastos (descuenta el saldo de la cuenta y entra a Balances).

**Ganancia real del mes (`listar_gastos`).** Ganancia real = ventas − producto − flete (contribución)
− comisiones del mes − sueldos básicos del mes − gastos. Los pagos de Nómina no se restan como gasto:
la nómina ya entra como comisiones + básicos del tablero de Nómina, y restarlos de nuevo la contaría
dos veces.

**Deuda con proveedoras (`deuda_con_proveedoras`).** Solo lectura. Lo que se le debe a una proveedora
= todo lo cargado en su cuenta − todo lo abonado (el saldo de su tarjeta en Proveedores; regla en
`src/lib/supplier-debt.ts`, la misma que usa esa pantalla). Por orden: costo acordado (lo cargado),
pagos con fecha y cuenta, y lo que falta; lo que no va a ninguna orden sale como "otros". Las fechas
solo filtran qué órdenes se listan (por fecha de la OF), nunca el total. Trae los pagos a proveedoras
sin cuenta (el mismo total de Balances). La página de detalle por mes de la proveedora cuenta distinto
y puede dar otro saldo.

**Estados de una cotización.** Revisión (borrador), Enviada, Aceptada, Rechazada y Expirada. Al
convertirla en venta queda "Aceptada". Un empleado solo ve, edita y convierte sus propias
cotizaciones; el dueño ve todas.

**Combos.** Un combo es un producto hecho de otros productos (componentes). En la cotización cada
componente es una línea, pero se muestra como un solo producto con el precio del combo. El combo no
tiene proveedora propia: se toma la de sus componentes.

**Fletes.** Hay dos: el flete de compra por unidad (en la ficha del producto, sube el costo de lo que
sale de stock) y el flete de envío al cliente (se registra por venta al despachar y resta en su
ganancia).

**Envío por ubicación.** Cada ciudad o corregimiento tiene un tipo: Gratis (el total es el precio),
Adicional (precio + envío adicional del producto; si el producto no tiene, el de su categoría; si
ninguno tiene, se cotiza), Se cotiza o No llegamos. "Automático" usa lo de antes: un corregimiento
sin tipo hereda el de su ciudad y, si nadie tiene tipo, es gratis si está marcado y si no se cotiza.
Valores iniciales aprobados (oct 2026): camillas y combos de camillas 100.000, sillas 50.000; 13
municipios de la Sabana, Medellín y Bucaramanga con envío gratis. Lo que agregan las asesoras desde
el CRM queda "pendiente de revisar" en `/admin/transporte` hasta que se le define el tipo.

**Fabricación.** Al "Fabricar" un producto se confirma la proveedora y el costo; eso genera un cargo
en su cuenta. Cada proveedora recibe una orden de fabricación (OF-) por orden de venta.

**Comisiones (pantalla `/admin/comisiones` y herramienta del asesor).** Desde octubre de 2026, 15% de
la ganancia de cada venta (decisión de Alexander, 15-oct-2026). Hasta septiembre de 2026: 10% en la
primera venta del mes de cada vendedora y 15% desde la segunda, en orden de la fecha en que cuenta
cada venta (pago completo; contraentrega: entrega). Vendedora = quien creó la cotización. Una venta
con ganancia cero o negativa no genera comisión. Las dos usan el mismo cálculo. Casos sin decisión
de Alexander (oct-2026), resueltos así mientras tanto: una venta sin cotización o con cotización sin
creador sale en "Sin asignar" y no genera comisión; una cotización creada por un usuario admin
genera comisión con la misma regla, pero la pantalla la marca "(admin)" y avisa; una venta pagada
que falta entregar ya genera comisión (su ganancia puede bajar si luego se registra un flete).
Solo el dueño/admin ve la pantalla: el módulo está reservado y no se puede asignar a un empleado.
**Comisión fija pactada:** una persona puede tener un % fijo (en Nómina → Editar salario), que
reemplaza la regla 10/15 en todas sus ventas desde el mes indicado (decisión de Alexander: María
Camila 15% fijo desde oct-2026). Aplica igual en Comisiones, Nómina, su link y el asesor de IA.

**Nómina (`/admin/comisiones/nomina`, decisión de Alexander 15-oct-2026).** Total del mes por
persona = básico del mes + comisión del mes; falta pagar = total − pagos de Nómina de esa persona para
ese mes. Básico por quincena = 2 quincenas al mes; por día = tarifa × días trabajados (hasta oct-2026
los escribe el dueño; desde nov-2026 salen de la Asistencia); sin básico = solo comisión. Un básico en dólares se pasa a pesos con la TRM guardada (si no hay
TRM no se calcula, nunca se inventa). Un pago registrado desde la pantalla lleva el mes en la
descripción (" · AAAA-MM") y cuenta en ese mes aunque se pague después; un gasto de Nómina sin ese
mes cuenta por su fecha. Comprobante obligatorio salvo en efectivo (misma regla de Gastos).

**Equipo (`/admin/equipo`, oct-2026).** Cada trabajador tiene una ficha: datos personales (cédula,
nacimiento con la edad calculada, celular, correo, dirección, contacto de emergencia), cargo,
vinculación (freelance, empleado u otro), forma de pago (por quincena, por día o solo comisión),
fecha de ingreso y fecha de salida (último día trabajado) con su motivo. El estado no se escribe:
Retirado/a = su fecha de salida ya pasó; el día de la salida todavía trabaja. Una ficha puede no
tener usuario (alguien que no entra al sistema). Regla única "¿trabajaba en tal fecha?": desde el
ingreso hasta la salida, ambos inclusive (base del control de asistencia). En la **nómina** entra
todo el que trabajó algún día del mes, aunque no tenga salario configurado; un retirado aparece
hasta su mes de salida y después solo si todavía tiene comisión o pagos de ese mes (no se esconde
plata que se le debe). Las **comisiones** no cambian para quien sale; solo se marca "Retirado/a".
A un retirado no se le asignan órdenes, trabajos de producción ni gastos nuevos, pero su nombre se
sigue viendo en lo viejo. Lo que se paga sale de Nómina; la forma de pago de la ficha es una pista
y se avisa si no coincide. Solo el dueño/admin ve y edita las fichas; el asesor de IA (herramienta
`equipo`) y la bitácora no muestran datos personales. Carga inicial (una sola vez): Alexander
(dueño), Ingrid Sánchez y María Camila Ardila (activas), Emanuel Díaz (ingreso 15-oct-2026, por
día) y Génesis (salida 20-oct-2026); lo que faltaba quedó vacío para que Alexander lo complete.

**Asistencia (`/admin/asistencia`, oct-2026).** Cada Empleado o Admin marca su entrada y su salida
con el botón de la barra de Gestión (celular o PC). La hora la pone el servidor (hora Colombia) y
nadie la escribe; se pueden hacer varias entradas y salidas en el día (ej. almuerzo). Un doble clic no
crea dos entradas: el servidor revisa la última marca. Si una persona no puede marcar (sin celular),
un admin marca por ella con la hora del servidor y queda "marcada por un admin". Solo un admin
corrige: agrega una marca olvidada, corrige una mal hecha o anula una repetida, siempre con motivo;
la marca original nunca se borra, queda anulada, y la nueva queda "Corregida" con quién, cuándo y
por qué (también en la bitácora). Un día cuenta como trabajado si tiene al menos una entrada vigente;
una salida olvidada no inventa horas (el día cuenta, esa entrada no suma horas). El turno que pasa
de medianoche cuenta en el día de la entrada (una entrada de otro día sigue abierta solo si se marcó
desde las 6 p. m. y lleva menos de 12 horas; si no, se toma como salida olvidada y toca entrada).
Solo marca quien está activo según su ficha de Equipo (no un retirado ni antes de su ingreso); un
usuario sin ficha solo aparece en Asistencia los días que marca. Desde **noviembre de 2026** (`ASISTENCIA_NOMINA_DESDE`) la nómina de quien cobra por día
toma los días de la asistencia (si no marcó nada, 0 días); octubre y antes siguen con los días
escritos a mano. Quien cobra por quincena no cambia.

**Dinero hoy.** Saldo de cada cuenta = saldo inicial + pagos de clientes − pagos a proveedoras −
fletes − gastos ± movimientos. Se muestra arriba de Balances y de Nómina. Los pagos o fletes sin
cuenta asignada no suman ni restan en ningún saldo y se avisan aparte.

**Origen de la venta.** Sale de la línea de WhatsApp del chat en el CRM: Ventas 1 = Meta Ads,
Ventas 2 = Marketplace, Admin = Referido, o Recurrente si el cliente ya tenía una venta anterior
(no cancelada). Venta directa (sin chat) = Mostrador. Sin origen registrado = "Sin dato" (siempre se
muestra en el reporte para no inflar los canales). El CRM avisa al marcar el chat como ganado con su
cotización; un aviso nuevo reemplaza al anterior. El teléfono del chat solo se usa para decidir si es
recurrente; no se guarda.

**Retención en la fuente (oct-2026).** Algunas empresas clientes no pagan el 100%: se quedan con una
parte y la pagan a la DIAN a nombre de Magilus. Se registra como un abono "Retención en la fuente"
(con número de certificado opcional): suma a lo pagado de la venta (si completa el total, la venta
queda pagada y entra a Balances y comisiones), pero no entra a ninguna cuenta ni sale en el aviso de
"plata sin cuenta". No se resta de la ganancia (es un anticipo de impuesto, no un costo). Reporte por
mes y total del año en `/admin/ventas/retenciones`, con descarga CSV para el contador.

## Qué NO tiene el sistema

- El **origen** de las ventas anteriores a oct-2026 casi siempre es "Sin dato" (se puede rellenar con `npm run origen:rellenar`, que cruza el teléfono del cliente con el CRM).
- No tiene un campo **vendedora**: se usa a quien creó la cotización.
- Las comisiones se pagan desde **Nómina** (gasto de Nómina por persona y mes); la pantalla de Comisiones solo calcula. La nómina no calcula prestaciones, seguridad social ni retenciones.
- No es **multi-empresa**: no hay workspaces; todos los datos son de Magilus.
- Las órdenes de fabricación (OF-) **no tienen estado** (enviada, en fabricación, recibida).
- Los reportes de ganancia **no incluyen ventas con saldo pendiente** ni contraentregas sin entregar. Una venta pagada sin entregar sí cuenta; su costo puede subir después si al despachar se registra un flete o se confirma otro costo de proveedora.
- La contribución (`resumen_del_mes`) **no descuenta gastos operativos**; esos están en el módulo Gastos. La ganancia real con gastos sale de `listar_gastos`.
- Por `registrar_gasto` la foto del soporte es **opcional y no se revisa**, así que puede haber gastos sin comprobante o con una foto que no corresponde (la pantalla de Gastos muestra cuáles no tienen foto). Confirmar dos veces crea dos gastos. No hay forma de borrar ni editar un gasto por Claude: se hace desde la pantalla de Gastos.
- Un usuario con historial (ventas, cotizaciones, gastos) **no se puede borrar** y no existe "desactivar usuario": hay que quitarle módulos o cambiarle el rol. Dar de baja en Equipo no le quita el acceso a Gestión.
- La **asistencia** solo la marcan los usuarios Empleado o Admin: una ficha de Equipo sin usuario no puede marcar ni aparece en Asistencia (hay que crearle un usuario, aunque nunca entre, y un admin marca por esa persona). No hay geolocalización ni foto al marcar. La nómina no prorratea el básico del mes de ingreso o salida: se avisa para revisarlo.
- No hay **pruebas automáticas** en el pipeline de despliegue (ver riesgos).
- La foto de la aplicación en producción **no trae el commit**, porque `.git` no entra a la imagen; se identifica por la fecha del build.
- **Corte de mes:** los meses se cortan a medianoche UTC (7:00 p. m. en Colombia). Un pago (o una entrega, en contraentrega) registrado después de las 7 p. m. del último día del mes cae en el mes siguiente. Si la fecha se edita a mano en el historial, queda al mediodía y no pasa.

## Riesgos de operación

- La **llave del MCP en la ruta** (`/api/mcp/{llave}`) queda escrita en la URL: puede aparecer en logs de Traefik o del proxy y en la configuración del conector. Si se filtra, cambia `MCP_API_KEY` en Portainer y vuelve a desplegar.
- Un **cambio de base de datos** que salga mal se aplica directo en producción al arrancar; revisa bien las migraciones antes de hacer push a `main`.
- `/cobertura` solo mira la marca de envío gratis de la ubicación elegida: un corregimiento sin tipo propio de una ciudad gratis sale "no gratis" en `/cobertura`, aunque el CRM lo informe como gratis por herencia.
- `/api/transporte/ubicaciones` (POST) crea corregimientos desde el CRM: si la llave se filtra, alguien podría llenar la lista de pendientes. Se cambia `TRANSPORTE_API_KEY` (o la llave que esté en uso).
- La **base de datos** tiene respaldo nocturno (2:30 a. m.) en aizen1 y en Google Drive ("Respaldos/Gestion", 30 días; ver `scripts/respaldo` y el README), pero las **fotos y comprobantes** (`/public/uploads`) **todavía no tienen respaldo**. Si falla el respaldo llega un correo; si el servidor está apagado no llega nada: la señal es que no haya archivo nuevo en Drive esa mañana. Los respaldos traen datos personales: la carpeta de Drive no se comparte.
- Los riesgos que se deducen de la configuración (arranque, pipeline, réplicas, volúmenes) los detecta la herramienta sola desde el Dockerfile, el workflow y el docker-compose; aquí van solo los que no se pueden deducir.
