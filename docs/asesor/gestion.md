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
- `transporte`: cobertura de envío gratis por departamento, ciudad y corregimiento (datos DANE) que consulta el cliente en `/cobertura`.
- `asesor`: consultas de solo lectura para el asesor de IA (servidor MCP en `/api/mcp`): resumen del mes, ventas, cotizaciones, productos, comisiones y esta radiografía.

## Entidades

- `User`: cualquier persona con cuenta: dueño/admin, empleados y clientes (rol `Role`). Los clientes se crean al cotizar. Es el autor de casi todos los registros.
- `ActivityLog`: bitácora de auditoría: quién creó, editó o borró qué.
- `Product`: producto del catálogo con precio de venta, costo de proveedor, flete por unidad, márgenes, precio mayorista y bandera de combo u oculto en tienda.
- `ProductReview`: reseña o calificación de un producto en la tienda.
- `ProductComponent`: composición de un combo: qué productos hijos y en qué cantidad forman un producto combo.
- `ProductImage`: imágenes ordenadas de un producto.
- `Category`: categoría del catálogo.
- `Supplier`: proveedora: fábrica (`MANUFACTURER`) o transportadora (`SHIPPING`). Tiene enlace de estado de cuenta.
- `SupplierLedgerEntry`: movimiento de la cuenta con una proveedora: cargo (lo que se le debe) o abono (pago). Puede atarse a una venta, orden, producto de orden, despacho o compra de inventario.
- `ProductSupplier`: qué proveedoras fabrican cada producto, a qué costo y cuál es la preferida.
- `AppSetting`: configuración del sistema como clave y valor (moneda, marca, color, WhatsApp, permisos por módulo, etc.).
- `Quote`: cotización (COT-) a un cliente, con enlace para compartir. Puede convertirse en una venta.
- `Sale`: venta (SAL-) nacida de una cotización. Lleva el total a cobrar, descuento y su estado de pago.
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
- `TransportCity`: municipio de Colombia (DANE) y si tiene envío gratis.
- `TransportLocality`: corregimiento o centro poblado (DANE) y si tiene envío gratis.

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
- `/uploads/[...path]`: sirve los archivos subidos (comprobantes, imágenes).
- `/verify-email`: confirma el correo de un usuario desde el enlace enviado.

## Reglas de negocio

**Ganancia de una venta.** Ganancia = valor de la venta − costo de los productos − fletes de envío
de esa venta. El costo de cada producto vendido es, en este orden: el costo confirmado con la
proveedora en la orden; si no hay y el producto sale de stock, costo de catálogo + flete por unidad;
si no, el costo de la proveedora preferida o el costo de catálogo. No resta gastos operativos.

**Cuándo cuenta una venta.** Solo cuenta cuando está pagada por completo (estado "facturada": lo
pagado ≥ total) y su orden está entregada. Se reconoce en el mes de la ENTREGA, no en el de la venta.
Si se vende en un mes y se entrega en otro, la ganancia cae en el mes de entrega.

**Estados de una cotización.** Revisión (borrador), Enviada, Aceptada, Rechazada y Expirada. Al
convertirla en venta queda "Aceptada". Un empleado solo ve, edita y convierte sus propias
cotizaciones; el dueño ve todas.

**Combos.** Un combo es un producto hecho de otros productos (componentes). En la cotización cada
componente es una línea, pero se muestra como un solo producto con el precio del combo. El combo no
tiene proveedora propia: se toma la de sus componentes.

**Fletes.** Hay dos: el flete de compra por unidad (en la ficha del producto, sube el costo de lo que
sale de stock) y el flete de envío al cliente (se registra por venta al despachar y resta en su
ganancia).

**Fabricación.** Al "Fabricar" un producto se confirma la proveedora y el costo; eso genera un cargo
en su cuenta. Cada proveedora recibe una orden de fabricación (OF-) por orden de venta.

**Comisiones (herramienta del asesor).** 10% de la ganancia en la primera venta del mes de cada
vendedora y 15% desde la segunda, en orden de fecha de entrega. Vendedora = quien creó la
cotización. Una venta con ganancia cero o negativa no genera comisión.

## Qué NO tiene el sistema

- No guarda el **origen** del cliente (WhatsApp, Instagram, web, referido).
- No tiene un campo **vendedora**: se usa a quien creó la cotización.
- No es **multi-empresa**: no hay workspaces; todos los datos son de Magilus.
- Las órdenes de fabricación (OF-) **no tienen estado** (enviada, en fabricación, recibida).
- Los reportes de ganancia **no incluyen ventas pendientes** de pago o de entrega.
- La contribución **no descuenta gastos operativos**; esos están en el módulo Gastos.
- Un usuario con historial (ventas, cotizaciones, gastos) **no se puede borrar** y no existe "desactivar usuario": hay que quitarle módulos o cambiarle el rol.
- No hay **pruebas automáticas** en el pipeline de despliegue (ver riesgos).
- La foto de la aplicación en producción **no trae el commit**, porque `.git` no entra a la imagen; se identifica por la fecha del build.
- **Corte de mes:** los meses se cortan a medianoche UTC (7:00 p. m. en Colombia). Una entrega registrada en el momento después de las 7 p. m. del último día del mes cae en el mes siguiente. Si la fecha se edita a mano en el historial, queda al mediodía y no pasa.

## Riesgos de operación

- La **llave del MCP en la ruta** (`/api/mcp/{llave}`) queda escrita en la URL: puede aparecer en logs de Traefik o del proxy y en la configuración del conector. Si se filtra, cambia `MCP_API_KEY` en Portainer y vuelve a desplegar.
- Un **cambio de base de datos** que salga mal se aplica directo en producción al arrancar; revisa bien las migraciones antes de hacer push a `main`.
- Los riesgos que se deducen de la configuración (arranque, pipeline, réplicas, volúmenes) los detecta la herramienta sola desde el Dockerfile, el workflow y el docker-compose; aquí van solo los que no se pueden deducir.
