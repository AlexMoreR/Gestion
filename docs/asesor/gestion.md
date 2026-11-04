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
- `retroactivos`: registro de ventas, abonos y gastos cargados con una fecha anterior al día real (hora Colombia): exige motivo y guarda quién, cuándo de verdad, la fecha puesta y el monto. Se consulta en `/admin/retroactivos` y por Claude con `listar_retroactivos` (solo lectura).
- `inventory`: stock por producto, movimientos de entrada/salida/ajuste y compras directas a proveedor (COM-).
- `transporte`: tipo de envío por departamento, ciudad y corregimiento (datos DANE): gratis, adicional, se cotiza o no llegamos. Lo consulta el cliente en `/cobertura` (solo si es gratis o no) y el CRM de las asesoras por `/api/transporte/ubicaciones`.
- `ventas`: reglas de la venta: forma de pago (50/50 o contraentrega; desde nov-2026 una cotización no pasa a venta sin forma de pago ni sin el comprobante de cada abono, también en efectivo, y al corregirla no se puede dejar "Sin definir"), origen de cada venta (lo avisa el CRM por `/api/ventas/origen`; reporte en `/admin/ventas/origen`) y abonos por retención en la fuente (reporte en `/admin/ventas/retenciones`).
- `nomina`: nómina del mes (salario básico de cada persona + comisiones − lo ya pagado) y el dinero de hoy por cuenta. La configuración (básicos, TRM, días trabajados) vive en `AppSetting` (`payrollConfig`); los pagos son gastos de la categoría Nómina.
- `equipo`: ficha de cada trabajador (ingreso, salida, contacto, forma de pago) y las reglas de estado Activo/Retirado, edad y "¿trabajaba en tal fecha?". La nómina, las comisiones y las asignaciones la usan para incluir a los activos y sacar a los retirados.
- `revisor`: revisor diario de solo lectura (`GET /api/revisor`, cron de las 7:00 a. m. en aizen1): busca ventas, pagos, stock, compras, borrados, numeración y saldos que no cuadran y devuelve la lista de hallazgos; el script `scripts/revisor` decide si avisa por correo a Sistemas o también al dueño.
- `asesor`: consultas para el asesor de IA (servidor MCP en `/api/mcp`): resumen del mes, ventas, cotizaciones, productos, comisiones, nómina, equipo, saldos de cuentas, gastos del mes con la ganancia real (`listar_gastos`), cuánto se le debe a cada proveedora orden por orden (`deuda_con_proveedoras`), pedidos por clienta o ciudad con su estado (`buscar_pedido`, `pedidos_abiertos`), la cobertura de envíos (`listar_cobertura`), la bitácora de quién creó, cambió o borró algo (`historial_de_registro`) y esta radiografía. Es de solo lectura salvo `registrar_gasto`, `registrar_pago_proveedora` y `cerrar_mes` (ver reglas). También alimenta la pantalla de Comisiones del panel (`/admin/comisiones`), con el mismo cálculo.

## Entidades

- `User`: cualquier persona con cuenta: dueño/admin, empleados y clientes (rol `Role`). Los clientes se crean al cotizar. Es el autor de casi todos los registros.
- `ActivityLog`: bitácora de auditoría: quién creó, editó o borró qué, con el código de la cosa, cómo estaba antes y cómo quedó, desde dónde (pantalla, Claude, CRM, script o migración) y, para arreglos técnicos, la tarjeta y el commit. Claude la lee con `historial_de_registro`.
- `GastoBorrador`: enlace para subir la foto (opcional) de un gasto dicho a Claude. Guarda los datos del gasto, el hash del enlace (nunca el enlace) y el estado (`GastoBorradorEstado`: pendiente, guardado, rechazado, vencido). El `Expense` ya existe desde que el dueño confirma; el enlace dura 24 horas, sirve una vez y al subir la foto se pega a ese gasto y el borrador queda guardado. Los campos de intentos, rechazo y revisión son de la antigua revisión con IA (un enlace viejo, sin gasto, guarda el gasto al recibir la foto).
- `Product`: producto del catálogo con precio de venta, costo de proveedor, flete por unidad, márgenes, precio mayorista, bandera de combo u oculto en tienda y, opcional, su propio envío adicional (COP) que pisa el de la categoría.
- `ProductReview`: reseña o calificación de un producto en la tienda.
- `ProductComponent`: composición de un combo: qué productos hijos y en qué cantidad forman un producto combo.
- `ProductComponentAlternate`: pieza alterna de un componente de combo (ej. butaco BMV016 o BMV003); misma cantidad que la principal y suma a su stock.
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
- `OrderItem`: producto dentro de una orden, con la proveedora confirmada y el costo real que se le paga; si sale por stock, `stockCostSource` dice de qué compra salió ese costo (p. ej. "ORD-00092" o "catálogo").
- `OrderItemPhoto`: foto de evidencia de un producto de una orden (fabricación o estado).
- `ProductionJob`: trabajo de fabricación de un producto de una orden.
- `Dispatch`: despacho o entrega de una orden: tipo de entrega, transportadora, guía, costo de envío y fotos.
- `DispatchItem`: qué productos y cuántas unidades salen en un despacho; reparte el costo del envío.
- `OrderStatusHistory`: cada cambio de estado de una orden; la última entrada a "entregada" es la fecha de entrega.
- `OrderNote`: notas internas del equipo sobre una orden (texto, quién y cuándo). Se ven en el detalle de la orden y como ícono en la lista; nunca salen al cliente, a la proveedora ni en guías. Se borran con la orden.
- `OrderItemReversal`: cada reversa de una entrega o un despacho con su motivo de la lista (clave, texto si es "Otro", comentario opcional), estado de antes y de después, quién y cuándo. La crean **Deshacer entrega** (de toda la orden o de un producto, de ENTREGADO a DESPACHADO) y **Reversar despacho** de un producto. Se ve en la tarjeta "Reversas" del detalle de la orden. No toca dinero: Balances, fletes y comisiones no cambian. Se borra con la orden; si se quita el despacho o la línea, queda sin ellos.
- `DispatchItem.deliveryReversedAt`: fecha en que se deshizo la entrega de ese producto en su despacho. Un producto está Entregado solo con su despacho entregado y esta columna vacía; al volver a entregarlo se vacía. Una orden cerrada con productos así se ve "Entregado parcial – N sin entregar".
- `Account`: cuenta de dinero del negocio (efectivo, banco, billetera) con saldo inicial. El tipo `OWNER` es la cuenta "Aportes del dueño": gastos de Magilus pagados con la plata del dueño; no es dinero del negocio.
- `AccountMovement`: entrada, salida o transferencia manual de dinero en una cuenta.
- `ExpenseCategory`: categoría de gasto operativo.
- `Expense`: gasto operativo pagado desde una cuenta.
- `RegistroAnulado`: copia de un abono o gasto que se anuló: de qué tabla, qué registro (sin llave foránea, queda aunque el original ya no exista), código, monto, la fila completa, motivo, desde dónde, quién y cuándo.
- `RegistroRetroactivo`: una venta, abono o gasto registrado con fecha anterior a hoy: tipo, a qué registro apunta (queda aunque el registro se borre), fecha puesta, momento real del registro, quién, motivo y monto copiado.
- `InventoryMovement`: entrada, salida o ajuste de stock de un producto.
- `CompraUnidad`: una unidad de una compra por lote a proveedora (migración `20261105120000_compra_por_lote`). Estado Pendiente → Fabricando (con color) → En inventario (Cali o Taller proveedora) → Vendida (con su orden de venta). La deuda con la proveedora se carga completa al registrar la compra; al inventario solo entra lo fabricado ("Llegó" suma 1, sin cargo nuevo). "Salió en venta" es manual.
- `ColorMaterial`: material de la antigua carta de colores de Gestión (Cuerotex, Prana, Corsos y Telas). Sin uso desde nov-2026; la carta vive en el CRM. Los datos se conservan.
- `CartaColor`: un color de la antigua carta de colores de Gestión (código, nombre, muestra, foto). Sin uso desde nov-2026; la carta vive en el CRM. Los datos se conservan.
- `ParteColor`: una parte de un producto que lleva color propio (ej. Tapizado, Estructura), con su orden (migración `20261108120000_partes_de_color`). Cuelga de una categoría (plantilla para sus productos) o de un producto (partes propias), nunca de los dos. Tipo Carta: sus colores salen de la carta del CRM, solo de los materiales marcados (ej. Cuero, Tela). Tipo Acabados: una lista fija escrita a mano (ej. Cromada, Dorada, Negra). Si el producto tiene partes propias mandan esas; si no, las de su categoría. `mascaraUrl`: PNG en blanco y negro sobre la foto de portada (blanco = la parte), pintado en `/admin/productos/[productId]/mascaras` y guardado en `public/uploads/mascaras/`; guardar las partes conserva la máscara de cada parte con el mismo nombre. Todavía no se usa en cotizaciones, ventas ni órdenes.
- `MonthClosure`: cierre de mes congelado (ventas, costos, envíos, gastos, utilidad y margen) que se comparte por correo.
- `ManufacturingOrder`: orden de fabricación (OF-) de una proveedora dentro de una orden de venta, con enlace para enviársela, fecha y dirección de entrega.
- `TeamMember`: ficha de un trabajador (Equipo): datos personales, cargo, vinculación, forma de pago, fecha de ingreso, fecha de salida y motivo. Unida opcionalmente (y una sola vez) a su usuario; si se borra el usuario, la ficha queda. El nombre de la ficha es el nombre visible del usuario unido: al guardarla se copia a `User.name` y todo lo demás sigue ligado al id. La sesión de la persona puede mostrar el nombre viejo hasta que vuelva a entrar, y los PDF ya generados conservan el nombre viejo.
- `AsistenciaMarca`: La asistencia se quitó (28-oct-2026); la tabla `AsistenciaMarca` queda con los datos viejos, sin uso.
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
- `/fabricacion/[token]`: orden de fabricación para la proveedora: sus productos, medidas, color (si viene de la carta del CRM, con la foto de la muestra, el código y el material), fecha, dirección y costo, sin precio de venta ni datos del cliente.
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
- `/admin/inventario/lotes`: compras por lote a proveedora: resumen "Cali · Taller proveedora · Fabricando · Pendientes", cada lote con proveedora, producto, costo por unidad, total, pagado y saldo, y por unidad los botones Pasar a fabricar, Llegó, Cambiar ubicación, Editar color y Salió en venta.
- `/admin/productos/new`: crear producto.
- `/admin/productos/[productId]`: editar un producto.
- `/admin/productos/[productId]/mascaras`: máscaras de color (solo Admin): sobre la foto de portada se pinta con pincel y borrador la zona de cada parte de color y se guarda como PNG en blanco y negro. Si el producto usaba las partes de su categoría, al guardar la primera máscara se copian como propias.
- `/admin/cotizaciones/[quoteId]`: editar una cotización.
- `/admin/comisiones`: comisiones de las asesoras del mes (solo el dueño/admin): resumen por asesora (# ventas, valor vendido, ganancia, comisión), detalle de cada venta con el % aplicado (10/15) y "Falta entregar", y total del mes. Selector de mes (por defecto el actual, hora de Colombia).
- `/mis-comisiones/[token]`: link privado de cada asesora (sin iniciar sesión): sus ventas del mes con la comisión explicada venta por venta, la regla en lenguaje claro y sus cotizaciones abiertas con la comisión aproximada si las cierra. Nunca muestra costos ni fletes. Se crea o cambia desde Nómina (token en `AppSetting.sellerCommissionLinks`).
- `/admin/comisiones/nomina`: nómina del mes (solo el dueño/admin): "Dinero hoy" por cuenta arriba, y por persona el básico del mes, la comisión, el total, lo pagado y lo que falta. Configurar salario (por quincena, por día o sin básico; en COP o USD), TRM, días trabajados y botón "Registrar pago" que crea un gasto de Nómina desde la cuenta elegida.
- `/admin/equipo`: equipo de trabajo (solo el dueño/admin): fichas de Activos / Retirados / Todos, búsqueda por nombre y filtro por forma de pago; crear, editar, dar de baja (fecha de salida + motivo) y reactivar.
- `/admin/ventas/origen`: ventas por origen (Meta Ads, Marketplace, Referido, Recurrente, Mostrador, Sin dato) por mes y por anuncio, con el criterio de Balances.
- `/admin/ventas/retenciones`: retenciones en la fuente del mes (`?mes=AAAA-MM`): fecha, venta, cliente, NIT/cédula, valor y certificado; total del mes y del año; descarga CSV para la declaración de renta.
- `/admin/ordenes/[orderId]`: detalle de una orden: fabricar, recoger, despachar, entregar, historial, abonos y órdenes de fabricación.
- `/admin/ordenes/[orderId]/ganancia`: desglose de por qué se ganó lo que se ganó en esa orden.
- `/admin/ordenes/[orderId]/editar-compra`: editar una compra directa a proveedor.
- `/admin/proveedores/[supplierId]`: ficha de una proveedora.
- `/admin/proveedores/[supplierId]/cuenta`: cuenta corriente de una proveedora (cargos y abonos).
- `/admin/balances/cuentas/[accountId]`: movimientos de una cuenta de dinero.
- `/admin/balances`: rentabilidad del mes y cuentas; en la pestaña Cuentas, la tarjeta "Aportes del dueño" con el total por mes y los gastos de cada mes pagados con la cuenta del dueño.
- `/admin/retroactivos`: registros retroactivos del mes (por el día real del registro): lista con quién, cuándo, fecha puesta, días de atraso, monto y motivo, y resumen por persona; filtros mes, persona y tipo. Solo el dueño/admin con acceso a Balances.
- `/admin/productos/export`: descarga el catálogo de productos en CSV.
- `/api/auth/[...nextauth]`: inicio y cierre de sesión (next-auth).
- `/api/generate-quote-pdf`: genera el PDF de una cotización.
- `/api/generate-sale-invoice-pdf`: genera el PDF de la factura o comprobante de una venta.
- `/api/informe`: informe mensual en JSON (con token).
- `/api/informe/link`: entrega al dueño el enlace del informe con su token.
- `/api/mcp`: servidor MCP de solo lectura del asesor de IA (llave en header).
- `/api/mcp/[key]`: el mismo servidor MCP con la llave dentro de la ruta (conectores de claude.ai).
- `/api/asesor/precios-vigentes`: hoja "Precios vigentes" en Markdown para Claude (con la llave del MCP): cada producto visible en la tienda con código, nombre, qué es (combo o categoría), precio y COSTO, los más vendidos de 90 días primero. Ojo: lleva costos; no se comparte con clientes ni con la llave del catálogo.
- `/api/ventas/origen`: para el CRM (con llave). POST avisa de dónde vino el cliente de una cotización (al marcar el chat como ganado); se guarda en la cotización y en su venta.
- `/api/transporte/ubicaciones`: para el CRM (con llave). GET busca ciudades y corregimientos sin importar acentos, dice su tipo de envío y, si se manda un producto, el total con envío. POST agrega un corregimiento o barrio nuevo bajo una ciudad sin duplicar.
- `/uploads/[...path]`: sirve los archivos subidos (comprobantes, imágenes).
- `/verify-email`: confirma el correo de un usuario desde el enlace enviado.

## Reglas de negocio

- `listar_cobertura`: herramienta de Claude, solo lectura. Trae la cobertura de envíos de `/admin/transporte`: el tipo efectivo (Gratis, Adicional, Se cotiza o No llegamos) de cada municipio por departamento, con la misma regla del panel (el propio; si no, el de su municipio; si no, gratis o se cotiza). Los corregimientos solo salen si su tipo es distinto al de su municipio; los demás solo cuentan en los totales por tipo. `pendiente_revision` marca lo nuevo del CRM sin revisar. Filtros opcionales `departamento` (con o sin tildes) y `tipo`. Sirve, por ejemplo, para las exclusiones de campañas. Regla en `buildCoverageReport`.
- `historial_de_registro`: herramienta de Claude, solo lectura. Por código (ORD, OF, COM, SAL, COT con o sin ceros, o el id de un pago o abono) o por día (hora Colombia) devuelve la bitácora de lo más viejo a lo más nuevo, una línea por entrada: hora, persona, origen (sin dato = "pantalla"), qué hizo, antes y después (solo los campos que cambiaron, cortado a unos 300 caracteres) y la tarjeta y commit si los tiene. Busca también las entradas viejas por el texto del resumen. Una orden o una compra (COM, por su orden) trae además sus cambios de estado. Máximo 500 líneas. Regla en `formatActivityLine`.
- `anular_con_motivo`: lo que tiene plata no se borra: se anula con motivo. "Anular" un abono (en `/admin/ventas`) o un gasto (en `/admin/gastos`) pide un motivo de al menos 3 letras, guarda la fila completa en `RegistroAnulado`, la quita y lo anota en la bitácora como "Anuló … (motivo)", todo junto: si algo falla no se borra nada. Si al anular un abono la venta queda debiendo, vuelve a Activa. Regla en `anularConMotivo` y `saleStatusForPaid`.
- `anular_venta`: "Anular venta" en `/admin/ventas` ya no borra: deja la venta y su orden en Cancelada con el motivo, devuelve el stock y lo anota en la bitácora con antes y después. Una venta anulada no cuenta en Balances.
- `borrado_definitivo_solo_dueno`: borrar de verdad una venta ("Borrar definitivamente") exige el permiso `hard_delete`, que solo tiene el ADMIN con su ficha de Equipo marcada como "Dueño". No sale en Control de módulos ni se le puede dar a otro rol o persona. Antes de borrar se guarda la copia completa en la bitácora.
- `scripts_firman`: todo script o migración que cambie datos firma con su tarjeta y su commit. Los scripts con `--aplicar` exigen `--tarjeta T-xxx` (si falta, se niegan antes de conectarse a la base) y dejan una fila en la bitácora con origen "SCRIPT", la tarjeta y el commit (`GIT_COMMIT` o `git rev-parse HEAD`). Una migración de datos inserta su propia fila con origen "MIGRACION". Regla en `exigirTarjeta` (`scripts/firma.mjs`).

**Ganancia de una venta.** Ganancia = valor de la venta − costo de los productos − fletes de envío
de esa venta. El costo de cada producto vendido es, en este orden: el costo confirmado con la
proveedora en la orden (para stock, el de la compra: regla `costo_stock_fifo`); si no hay y el producto sale de stock, costo de catálogo + flete por unidad;
si no, el costo de la proveedora preferida o el costo de catálogo. Si la venta no tiene orden, el costo
sale de los productos de la cotización (costo base + flete del catálogo). No resta gastos operativos.

**Costo de una pieza que sale por stock (`costo_stock_fifo`).** Al confirmar una pieza por stock, su
costo (`OrderItem.purchaseCost`) es lo que cobró la proveedora en la **compra más antigua que aún tiene
existencias** de esa pieza, sin el flete del producto (lo que queda en bodega son las unidades más nuevas).
La compra se lee de la orden de compra (ORD-) o, si se entró sin orden, del cargo INV- de la entrada. Si no
hay compra, va el costo de catálogo (costo base + flete) y queda marcado como "catálogo". De dónde salió
queda en `OrderItem.stockCostSource`. Lógica en `src/lib/stock-exit-cost.ts` +
`src/modules/inventory/domain/fifo-cost.ts`.

**Productos, links y ganancia en el asesor (`ver_venta`, `listar_ventas`, `listar_cotizaciones`).** Solo
lectura. Los productos de una venta salen de su orden o, si no tiene, de la cotización (`productos_fuente`),
con nombre, código, color, cantidad, precio, `costo_unitario` y `costo_origen`: `confirmado` (costo de la
proveedora en la orden), `inventario` (stock: costo de catálogo + flete), `estimado de catálogo` o `sin dato`.
Trae `link_cotizacion`, `link_venta` y `link_proveedora` (abren sin contraseña); sin orden, `orden: null` y
el aviso "Falta crear la orden". La ganancia es **confiable** (`ganancia_confiable = true`) solo si hay orden
y todos los productos tienen costo `confirmado` o de `inventario`; entonces es la de Balances. Si no, la de
Balances sale con `confiable: false` y no se presenta como real: `ver_venta` agrega el aviso "Costo aún no
confirmado: la ganancia real no se puede dar" y una `ganancia_estimada` (`estimada: true`) = total − Σ
costo_unitario × cantidad − flete. Balances, comisiones y nómina no cambian.

**Cuándo cuenta una venta.** Cuenta cuando está pagada por completo (estado "facturada": lo pagado
≥ total), aunque falte entregarla: el recaudo y la entrega son cosas distintas (decisión de
Alexander, 11-oct-2026). Se reconoce en la fecha del pago que la completó, y no cambia de mes cuando
luego se entrega. Mientras no se entrega aparece como "Falta entregar". Excepción: la
**contraentrega** se cobra al entregar, así que solo cuenta con la orden entregada y en el mes de la
entrega. Una orden cancelada no cuenta.

**Aportes del dueño.** Cuando el dueño paga un gasto de Magilus con su plata, el gasto se registra con
la cuenta "Aportes del dueño" (tipo `OWNER`). Cuenta para la ganancia como cualquier gasto, pero no baja
ningún banco ni aparece en "Dinero hoy", saldos, nómina ni la lista de cuentas. En Balances → Cuentas, la
tarjeta "Aportes del dueño" suma esos gastos por mes (mes en hora de Colombia) y muestra el detalle: es
una suma de gastos, no un saldo.

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

**Pagos a proveedoras por voz o chat (`registrar_pago_proveedora`).** Dos pasos como los gastos: con
`confirmado=false` Claude muestra el resumen (OF, proveedora, venta, costo, pagado, falta, cuenta, fecha y
avisos) sin guardar; con el "sí" (`confirmado=true`, una sola vez) se guarda **un abono** (`PAYMENT`) en la
cuenta de la proveedora ligado a la orden y la venta, y descuenta el saldo de la cuenta de dinero. La
respuesta trae un enlace secreto (`/proveedores-pago/soporte/<token>`, 24 horas, un solo uso) para subir la foto
del comprobante desde el celular; no se revisa. **Nunca se registra como gasto**: el pago ya es costo de la venta y como gasto se contaría dos veces.
Rechaza un pago igual (misma OF, monto y día) a los pocos minutos, un sobrepago sin motivo y una fecha
anterior sin motivo. Si ya no falta nada, los productos de esa proveedora en la orden quedan "pagados".
Regla del negocio (solo avisa): con 50%/50% a la proveedora se le paga de una vez; en contraentrega, cuando
el producto le llega al cliente. Queda a nombre de `MCP_GASTOS_USUARIO_EMAIL` o del administrador más antiguo.

**Cierre de mes: cuadre con el banco (`cerrar_mes`, nov-2026).** Alexander no es contable: el cierre es
una sola conversación. El último día del mes le llega un WhatsApp (línea Admin) pidiéndole el saldo real de
cada cuenta activa; el texto y si toca avisar los da `GET /api/cierre-mes/pendiente` (llave `ALERTAS_API_KEY`
o `MCP_API_KEY`), pero el envío lo hace el lado del CRM o aizen1, no Gestión. Él le dicta los saldos a Claude,
que primero muestra el resumen y con el "sí" crea **un movimiento manual de ajuste por cuenta** con diferencia
(entrada si en Gestión faltaba plata, salida si sobraba), con la nota "Cierre de mes AAAA-MM: cuadre con el
banco" y fecha del último día del mes. Responde en una línea: "Cuadró" o "En X faltaban/sobraban N pesos, ya
quedó ajustado". Una cuenta ya ajustada ese mes no se vuelve a ajustar; una diferencia de más de $1.000.000
pide confirmación aparte; no se cierra un mes que no ha terminado. Nada se borra: un error se corrige con un
movimiento contrario desde Balances.

**Ganancia real del mes (`resumen_del_mes` y `listar_gastos`).** Ganancia real = contribución (ventas −
producto − flete) − pagos de Nómina a empleados del mes − gastos sin nómina. La nómina cuenta en el mes
de la fecha del pago, no en el mes del trabajo. Los pagos de Nómina al usuario de la ficha marcada como
dueño en Equipo (`isOwner`) son retiros del dueño: se muestran aparte ("Nómina pagada: X · Retiros del
dueño: Y") y no se restan. No hacen falta fichas ni salarios configurados: se resta lo que de verdad se
pagó. Las dos herramientas traen el mismo bloque `ganancia_real`.

**Pedidos (`buscar_pedido`, `pedidos_abiertos`).** Solo lectura. Pedido = venta (SAL) no cancelada con
su orden de venta. `buscar_pedido` encuentra por nombre de la clienta, teléfono, ciudad, departamento,
producto o código (SAL, ORD, OF, COT, con o sin ceros) y devuelve máximo 10, el más reciente primero;
`pedidos_abiertos` trae todos los no entregados. Cada pedido: códigos, clienta, ciudad y departamento
(de la ficha de la clienta; "sin dato" si no están y se cuentan en `sin_ciudad`), productos con color,
vendedora, total, pagado y saldo (mismo cálculo de `ver_venta`), forma de pago, proveedora con su OF y
estado en palabras con fecha: por fabricar (Borrador o Liberada), en fabricación, listo para despacho,
despachado (transportador y guía) o entregado (fecha de entrega de Balances). Reglas en
`src/modules/asesor/domain/orders.ts`.

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
Una pieza del combo puede tener alternas: el stock de esa pieza es la principal más sus alternas
(así se cuenta cuántos combos se pueden armar), y al cotizar o vender por stock la línea sale con la
primera pieza que alcanza para toda la cantidad (principal, luego alternas); no mezcla piezas.
Combo sin piezas (31-oct-2026): si el código empieza por CMB o el nombre tiene la palabra "combo" o
"kit", Productos no deja guardarlo (crear ni editar) sin marcarlo como combo y sumar al menos 2 unidades
entre sus piezas ("Este producto es un combo: agrega sus piezas antes de guardar."); la carga por CSV salta
esas filas. `/admin/productos` muestra "Combos sin piezas (N)" y al cotizar sale un aviso que no bloquea
(`faltanPiezasCombo` en `src/lib/combo.ts`).

**Combo Camillas (orden sola con Laura).** Al registrar una venta que trae el Combo Camillas (CMB005 o
CAV-16), Gestión crea sola la orden de venta y confirma el combo con la proveedora Laura a su costo del
catálogo (600.000 por combo, una sola vez por combo), con su cargo en la cuenta de Laura. **No le manda
nada a Laura**: la orden muestra "Orden creada sola para Laura. Envíale el link" junto a los botones del
link de fabricación y WhatsApp, y la asesora lo envía. Si no se pudo (no trae productos, falta Laura o su
costo), la venta muestra en /admin/ventas la insignia roja "Falta el producto: no se pudo crear la orden";
esa alerta se calcula al ver la lista (trae el combo o no trae productos, sin orden y no cancelada), no se
guarda y desaparece sola cuando la venta tiene orden. Las ventas viejas SAL-00081 y SAL-00082 se rellenan
con `npm run combo:rellenar` (simula; `--aplicar` crea la orden con la misma lógica, solo si corresponde, y
nunca inventa productos). Crear la orden carga el costo a la venta: cambia su ganancia en Balances y la
comisión del mes de quien la vendió.

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
ese mes. Básico por quincena = 2 quincenas al mes; por día = tarifa × días trabajados (se escriben
a mano en Nómina, en todos los meses: `daysByMonth`); sin básico = solo comisión. Un básico en dólares se pasa a pesos con la TRM guardada (si no hay
TRM no se calcula, nunca se inventa). Un pago registrado desde la pantalla lleva el mes en la
descripción (" · AAAA-MM") y cuenta en ese mes aunque se pague después; un gasto de Nómina sin ese
mes cuenta por su fecha. Comprobante obligatorio salvo en efectivo (misma regla de Gastos).

**Equipo (`/admin/equipo`, oct-2026).** Cada trabajador tiene una ficha: datos personales (cédula,
nacimiento con la edad calculada, celular, correo, dirección, contacto de emergencia), cargo,
vinculación (freelance, empleado u otro), forma de pago (por quincena, por día o solo comisión),
fecha de ingreso y fecha de salida (último día trabajado) con su motivo. El estado no se escribe:
Retirado/a = su fecha de salida ya pasó; el día de la salida todavía trabaja. Una ficha puede no
tener usuario (alguien que no entra al sistema). Regla única "¿trabajaba en tal fecha?": desde el
ingreso hasta la salida, ambos inclusive. En la **nómina** entra
todo el que trabajó algún día del mes, aunque no tenga salario configurado; un retirado aparece
hasta su mes de salida y después solo si todavía tiene comisión o pagos de ese mes (no se esconde
plata que se le debe). Las **comisiones** no cambian para quien sale; solo se marca "Retirado/a".
A un retirado no se le asignan órdenes, trabajos de producción ni gastos nuevos, pero su nombre se
sigue viendo en lo viejo. Lo que se paga sale de Nómina; la forma de pago de la ficha es una pista
y se avisa si no coincide. Solo el dueño/admin ve y edita las fichas; el asesor de IA (herramienta
`equipo`) y la bitácora no muestran datos personales. Carga inicial (una sola vez): Alexander
(dueño), Ingrid Sánchez y María Camila Ardila (activas), Emanuel Díaz (ingreso 15-oct-2026, por
día) y Génesis (salida 20-oct-2026); lo que faltaba quedó vacío para que Alexander lo complete.

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

**Revisión de ventas sin costo (nov-2026).** `npm run ventas:revisar-costos` (por defecto octubre 2026,
`--mes=AAAA-MM` para otro) es **solo lectura**: lista las ventas del mes sin productos o con costo 0
(como la SAL-00083) con cotización, cliente, vendedora, total, estado, forma de pago, si tiene orden y
el motivo. No corrige nada: Alexander decide.

**Aviso diario de dinero por WhatsApp (oct-2026).** Para que no se acumule otro hueco sin que nadie
lo note: cada mañana (7:00 a. m., cron en aizen1, `scripts/alertas`) se le pregunta a Gestión
(`GET /api/alertas/dinero`, solo lectura, llave `ALERTAS_API_KEY` o `MCP_API_KEY`) y, solo si hay
algo, se le manda a Alexander un WhatsApp corto por la línea Admin: cuentas en saldo negativo (se
repite cada día mientras sigan así) y abonos, fletes o pagos a proveedoras guardados sin cuenta en
las últimas 24 h, con la venta o la proveedora y el monto (máximo 2 líneas, 3 casos y "y N más"). La
retención en la fuente no cuenta; los gastos no pueden quedar sin cuenta. Si todo está bien no llega
nada. Regla en `src/modules/balances/domain/money-alert.ts`.

**Revisor diario (nov-2026).** Cada mañana (7:00 a. m., cron en aizen1, `scripts/revisor`) se le
pregunta a Gestión `GET /api/revisor` (**solo lectura**, llave `REVISOR_API_KEY` o `MCP_API_KEY`) qué
datos no cuadran: ventas "Pagada" con saldo o pagadas sin marcar, pagos o cargos a proveedora sin su
orden, stock negativo, ítems por stock confirmados o entregados sin su salida, compras sin su entrada,
con otra cantidad o recibidas sin "Completada", borrados de ventas, órdenes o abonos sin copia en
anulados (desde el 1-nov-2026), huecos en la numeración ORD/SAL/COM, cuentas en negativo y saldos que
cambiaron sin movimientos que lo expliquen. El script guarda el JSON del día y avisa por **correo**
(no WhatsApp): lo nuevo a Sistemas; lo de plata que sigue desde ayer, también al dueño. No corrige
nada. Reglas en `src/modules/revisor/domain/checks.ts`; a quién avisar, `scripts/revisor/decidir-avisos.mjs`.

**Revisión del saldo y aviso de cuenta en negativo (nov-2026).** En la página de cada cuenta
(`/admin/balances/cuentas/[accountId]`) el recuadro **"Revisión del saldo"** mira todo el historial de la cuenta (no
solo el mes elegido) y dice: el punto más bajo y su fecha, el saldo inicial que haría falta (además
del actual) para que nunca bajara de cero, el primer día en negativo con el registro que lo causó y,
en efectivo, las "salidas que quizá no salieron de aquí" (señales de pago por banco; es una pista, no
una certeza) con el saldo inicial que haría falta si se pasaran a su banco. Es solo lectura: no mueve
nada. Aparte, cuando una salida deja una cuenta bajo cero, el mensaje de "registrado" agrega
"Ojo: <cuenta> quedó en −$X". **No bloquea**: el registro ya quedó guardado. Aparece al guardar
gastos, pagos de nómina, pagos a proveedoras y fletes en Balances, abonos a proveedoras (módulo
Proveedores), el pago a la proveedora al recoger un ítem de la orden ("pagar ya") y el flete pagado al
despachar (uno, en lote o tramo agregado; un aviso por cada cuenta distinta). Por Claude,
`registrar_gasto` con `confirmado=true` devuelve el campo `aviso` con ese texto ("" si la cuenta no
quedó en negativo). Regla en `src/modules/balances/domain/negative-balance.ts`.

- `recibo_de_caja`: al pasar una cotización a venta (un solo recibo por todas las cuotas del anticipo) y en
  cada abono nuevo, Gestión arma un **recibo de caja en PDF** (Magilus, Cali - Bogotá, Colombia; venta,
  fecha, cliente, producto, valor abonado, saldo, estado del pedido y asesora) y lo manda al CRM
  (`POST` a `CRM_RECIBO_URL`, por defecto `https://crm.magilus.com/api/gestion/recibo-de-caja`, con
  `Authorization: Bearer` y la llave `CRM_API_KEY`, si no `CATALOGO_API_KEY`, si no `MCP_API_KEY`), que lo
  reenvía por WhatsApp al cliente. Se manda después de responder a la asesora, con reintentos a los 2, 8 y
  30 s; el abono guarda `reciboCajaEstado` (ENVIADO/FALLIDO) y `reciboCajaEn`. La retención en la fuente y
  la venta de mostrador no llevan recibo. `RECIBO_CAJA_AVISO=off` lo apaga. No cambia montos, Balances ni
  comisiones. Reglas en `src/modules/ventas/domain/recibo-caja.ts`; prueba sin mandar:
  `npm run recibo:prueba -- --venta=SAL-123`.

## Qué NO tiene el sistema

- El **origen** de las ventas anteriores a oct-2026 casi siempre es "Sin dato" (se puede rellenar con `npm run origen:rellenar`, que cruza el teléfono del cliente con el CRM).
- No tiene un campo **vendedora**: se usa a quien creó la cotización.
- Las comisiones se pagan desde **Nómina** (gasto de Nómina por persona y mes); la pantalla de Comisiones solo calcula. La nómina no calcula prestaciones, seguridad social ni retenciones.
- No es **multi-empresa**: no hay workspaces; todos los datos son de Magilus.
- Las órdenes de fabricación (OF-) **no tienen estado** (enviada, en fabricación, recibida).
- Los reportes de ganancia **no incluyen ventas con saldo pendiente** ni contraentregas sin entregar. Una venta pagada sin entregar sí cuenta; su costo puede subir después si al despachar se registra un flete o se confirma otro costo de proveedora.
- La contribución (`resumen_del_mes`) **no descuenta gastos operativos**; la ganancia real con gastos y nómina pagada sale en el bloque `ganancia_real` de `resumen_del_mes` y de `listar_gastos`.
- Por `registrar_gasto` la foto del soporte es **opcional y no se revisa**, así que puede haber gastos sin comprobante o con una foto que no corresponde (la pantalla de Gastos muestra cuáles no tienen foto). Confirmar dos veces crea dos gastos. No hay forma de borrar ni editar un gasto por Claude: se hace desde la pantalla de Gastos.
- Un usuario con historial (ventas, cotizaciones, gastos) **no se puede borrar** y no existe "desactivar usuario": hay que quitarle módulos o cambiarle el rol. Dar de baja en Equipo no le quita el acceso a Gestión.
- La nómina no prorratea el básico del mes de ingreso o salida: se avisa para revisarlo.
- No hay **pruebas automáticas** en el pipeline de despliegue (ver riesgos).
- La foto de la aplicación en producción **no trae el commit**, porque `.git` no entra a la imagen; se identifica por la fecha del build.
- **Corte de mes y de día:** el día y el mes se cortan a medianoche de Colombia en todo el sistema (Balances, comisiones, nómina, gastos, retroactivos, equipo, Marketplace, cuenta de proveedoras). Una fecha que escribió una persona (la fecha de un abono, gasto o movimiento) cuenta en el día escrito; una hora real (cuando se registró algo) se lee en hora de Colombia. Un pago del 31 a las 8 p. m. es de ese mes, no del siguiente.

## Riesgos de operación

- El **recibo de caja** le llega por WhatsApp al cliente apenas el CRM salga de modo PRUEBA. Si el CRM está caído más de ~40 s, la llave no coincide o el contenedor se reinicia justo al guardar, el recibo no sale y no se reintenta solo (el abono queda "Recibo no enviado" o sin etiqueta). Para apagarlo: `RECIBO_CAJA_AVISO=off`.

- La **llave del MCP en la ruta** (`/api/mcp/{llave}`) queda escrita en la URL: puede aparecer en logs de Traefik o del proxy y en la configuración del conector. Si se filtra, cambia `MCP_API_KEY` en Portainer y vuelve a desplegar.
- Los **links de `ver_venta`/`listar_ventas`/`listar_cotizaciones`** (cotización, venta, orden de fabricación) abren sin contraseña, y el MCP muestra costos: quien tenga la llave del MCP los ve. Se comparten solo con el cliente o la proveedora que corresponde.
- Un **cambio de base de datos** que salga mal se aplica directo en producción al arrancar; revisa bien las migraciones antes de hacer push a `main`.
- `/cobertura` solo mira la marca de envío gratis de la ubicación elegida: un corregimiento sin tipo propio de una ciudad gratis sale "no gratis" en `/cobertura`, aunque el CRM lo informe como gratis por herencia.
- `/api/transporte/ubicaciones` (POST) crea corregimientos desde el CRM: si la llave se filtra, alguien podría llenar la lista de pendientes. Se cambia `TRANSPORTE_API_KEY` (o la llave que esté en uso).
- La **base de datos** tiene respaldo nocturno (2:30 a. m.) en aizen1 y en Google Drive ("Respaldos/Gestion", 30 días; ver `scripts/respaldo` y el README), pero las **fotos y comprobantes** (`/public/uploads`) **todavía no tienen respaldo**. Si falla el respaldo llega un correo; si el servidor está apagado no llega nada: la señal es que no haya archivo nuevo en Drive esa mañana. Los respaldos traen datos personales: la carpeta de Drive no se comparte.
- El **aviso diario de dinero** (`scripts/alertas`) corre fuera de la imagen: si el cron, Gestión o WAHA fallan ese día no llega nada (el error queda en `/var/log/magilus-alertas.log`) y no se reintenta. Lo que quedó sin cuenta hace más de 24 h no se vuelve a avisar; se ve en Balances. Quien tenga `ALERTAS_API_KEY` ve los saldos de las cuentas.
- El **revisor diario** (`scripts/revisor`) corre fuera de la imagen: si el cron o Gestión fallan, avisa a Sistemas; si el servidor está apagado no llega nada. Si falta el JSON de ayer, ese día no compara saldos. Quien tenga `REVISOR_API_KEY` ve códigos, montos y saldos de las cuentas.
- Los **cierres de mes guardados** (`MonthClosure`) son fotos congeladas: los que se hicieron antes del corte a medianoche de Colombia (nov-2026) no se recalculan solos y pueden diferir de lo que hoy muestra Balances para ese mes (ventas pagadas entre las 7 p. m. y la medianoche del último día).
- El **manual de pantallas** (`docs/asesor/pantallas.md`, `seccion='pantallas'`) se escribe a mano. Regla para el Coordinador y los agentes: toda tarjeta que cambie una pantalla de Gestión (un botón, una pestaña o una ruta) actualiza también `docs/asesor/pantallas.md`. Si no se cumple, Claude dará indicaciones viejas.
- Los riesgos que se deducen de la configuración (arranque, pipeline, réplicas, volúmenes) los detecta la herramienta sola desde el Dockerfile, el workflow y el docker-compose; aquí van solo los que no se pueden deducir.
