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
- `expenses`: gastos operativos por categoría y cuenta (nómina, marketing, servicios, etc.).
- `inventory`: stock por producto, movimientos de entrada/salida/ajuste y compras directas a proveedor (COM-).
- `transporte`: tipo de envío por departamento, ciudad y corregimiento (datos DANE): gratis, adicional, se cotiza o no llegamos. Lo consulta el cliente en `/cobertura` (solo si es gratis o no) y el CRM de las asesoras por `/api/transporte/ubicaciones`.
- `ventas`: reglas de la venta: forma de pago (50/50 o contraentrega) y origen de cada venta (lo avisa el CRM por `/api/ventas/origen`; reporte en `/admin/ventas/origen`).
- `nomina`: nómina del mes (salario básico de cada persona + comisiones − lo ya pagado) y el dinero de hoy por cuenta. La configuración (básicos, TRM, días trabajados) vive en `AppSetting` (`payrollConfig`); los pagos son gastos de la categoría Nómina.
- `asesor`: consultas de solo lectura para el asesor de IA (servidor MCP en `/api/mcp`): resumen del mes, ventas, cotizaciones, productos, comisiones, nómina, saldos de cuentas y esta radiografía. También alimenta la pantalla de Comisiones del panel (`/admin/comisiones`), con el mismo cálculo.

## Entidades

- `User`: cualquier persona con cuenta: dueño/admin, empleados y clientes (rol `Role`). Los clientes se crean al cotizar. Es el autor de casi todos los registros.
- `ActivityLog`: bitácora de auditoría: quién creó, editó o borró qué.
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
- `SalePayment`: anticipo o abono de un cliente a una venta, con método, fecha, comprobante y cuenta que recibe.
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
- `/admin/ventas/origen`: ventas por origen (Meta Ads, Marketplace, Referido, Recurrente, Mostrador, Sin dato) por mes y por anuncio, con el criterio de Balances.
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
ese mes. Básico por quincena = 2 quincenas al mes; por día = tarifa × días trabajados que escribe el
dueño; sin básico = solo comisión. Un básico en dólares se pasa a pesos con la TRM guardada (si no hay
TRM no se calcula, nunca se inventa). Un pago registrado desde la pantalla lleva el mes en la
descripción (" · AAAA-MM") y cuenta en ese mes aunque se pague después; un gasto de Nómina sin ese
mes cuenta por su fecha. Comprobante obligatorio salvo en efectivo (misma regla de Gastos).

**Dinero hoy.** Saldo de cada cuenta = saldo inicial + pagos de clientes − pagos a proveedoras −
fletes − gastos ± movimientos. Se muestra arriba de Balances y de Nómina. Los pagos o fletes sin
cuenta asignada no suman ni restan en ningún saldo y se avisan aparte.

**Origen de la venta.** Sale de la línea de WhatsApp del chat en el CRM: Ventas 1 = Meta Ads,
Ventas 2 = Marketplace, Admin = Referido, o Recurrente si el cliente ya tenía una venta anterior
(no cancelada). Venta directa (sin chat) = Mostrador. Sin origen registrado = "Sin dato" (siempre se
muestra en el reporte para no inflar los canales). El CRM avisa al marcar el chat como ganado con su
cotización; un aviso nuevo reemplaza al anterior. El teléfono del chat solo se usa para decidir si es
recurrente; no se guarda.

## Qué NO tiene el sistema

- El **origen** de las ventas anteriores a oct-2026 casi siempre es "Sin dato" (se puede rellenar con `npm run origen:rellenar`, que cruza el teléfono del cliente con el CRM).
- No tiene un campo **vendedora**: se usa a quien creó la cotización.
- Las comisiones se pagan desde **Nómina** (gasto de Nómina por persona y mes); la pantalla de Comisiones solo calcula. La nómina no calcula prestaciones, seguridad social ni retenciones.
- No es **multi-empresa**: no hay workspaces; todos los datos son de Magilus.
- Las órdenes de fabricación (OF-) **no tienen estado** (enviada, en fabricación, recibida).
- Los reportes de ganancia **no incluyen ventas con saldo pendiente** ni contraentregas sin entregar. Una venta pagada sin entregar sí cuenta; su costo puede subir después si al despachar se registra un flete o se confirma otro costo de proveedora.
- La contribución **no descuenta gastos operativos**; esos están en el módulo Gastos.
- Un usuario con historial (ventas, cotizaciones, gastos) **no se puede borrar** y no existe "desactivar usuario": hay que quitarle módulos o cambiarle el rol.
- No hay **pruebas automáticas** en el pipeline de despliegue (ver riesgos).
- La foto de la aplicación en producción **no trae el commit**, porque `.git` no entra a la imagen; se identifica por la fecha del build.
- **Corte de mes:** los meses se cortan a medianoche UTC (7:00 p. m. en Colombia). Un pago (o una entrega, en contraentrega) registrado después de las 7 p. m. del último día del mes cae en el mes siguiente. Si la fecha se edita a mano en el historial, queda al mediodía y no pasa.

## Riesgos de operación

- La **llave del MCP en la ruta** (`/api/mcp/{llave}`) queda escrita en la URL: puede aparecer en logs de Traefik o del proxy y en la configuración del conector. Si se filtra, cambia `MCP_API_KEY` en Portainer y vuelve a desplegar.
- Un **cambio de base de datos** que salga mal se aplica directo en producción al arrancar; revisa bien las migraciones antes de hacer push a `main`.
- `/cobertura` solo mira la marca de envío gratis de la ubicación elegida: un corregimiento sin tipo propio de una ciudad gratis sale "no gratis" en `/cobertura`, aunque el CRM lo informe como gratis por herencia.
- `/api/transporte/ubicaciones` (POST) crea corregimientos desde el CRM: si la llave se filtra, alguien podría llenar la lista de pendientes. Se cambia `TRANSPORTE_API_KEY` (o la llave que esté en uso).
- Los riesgos que se deducen de la configuración (arranque, pipeline, réplicas, volúmenes) los detecta la herramienta sola desde el Dockerfile, el workflow y el docker-compose; aquí van solo los que no se pueden deducir.
