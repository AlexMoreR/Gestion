# Gestión (Magilus)

Documento de referencia del proyecto, pensado para que otro agente (o desarrollador) entienda la
aplicación **sin leer el código**. Última revisión del contenido: septiembre de 2026.

---

## 1. Qué es esta aplicación

**Gestión** es la plataforma web de **Magilus**, un negocio colombiano (con sede en Cali y punto de
fábrica en Bogotá) que **fabrica y vende mobiliario profesional para peluquería, barbería y estética**
(sillas, camillas, lavacabezas, tocadores, poltronas de spa, butacos, combos, etc.).

Es una sola aplicación **Next.js** que cumple dos papeles:

1. **Tienda pública** (`magilus.com`): catálogo, fichas de producto, cotización por WhatsApp, lista de
   precios al por mayor, página de cobertura de envío gratis y páginas legales.
2. **Panel de administración interno** (`/admin/...`): todo el back-office del negocio — catálogo,
   inventario, clientes, cotizaciones, ventas, órdenes, producción, despachos, proveedores, balances
   (rentabilidad), gastos y transporte.

El dinero está en **pesos colombianos (COP)** y la app trabaja en zona horaria **America/Bogota**.

---

## 2. Qué maneja (módulos del panel)

Cada módulo del admin vive en `/admin/<slug>` y su acceso se controla por rol (ver sección 4). Los
módulos y para qué sirven:

| Módulo | Ruta | Para qué sirve |
|---|---|---|
| **Productos** | `/admin/productos` | Catálogo: crear/editar productos, precios, costos, combos, imágenes, ocultar de la tienda. |
| **Categorías** | `/admin/categorias` | Categorías del catálogo (con SEO y logo). |
| **Proveedores** | `/admin/proveedores` | Fabricantes y transportadoras; cuenta corriente (cargos/abonos) por proveedor. |
| **Inventario** | `/admin/inventario` | Stock por producto, movimientos (entradas/salidas/ajustes) y **compras directas** a proveedor. |
| **Clientes** | `/admin/clientes` | Directorio de clientes (se crean al cotizar). |
| **Cotizaciones** | `/admin/cotizaciones` | Crear/editar cotizaciones (código `COT-...`), enlace público para compartir. |
| **Ventas** | `/admin/ventas` | Ventas (código `SAL-...`): abonos/pagos, comprobante/factura, estado de pago. |
| **Órdenes** | `/admin/ordenes` | Órdenes de **venta** (cumplimiento al cliente) y de **compra** (a proveedor). Trazabilidad de estados. |
| **Producción** | `/admin/produccion` | Trabajos de fabricación (production jobs) por ítem de orden. |
| **Despachos** | `/admin/despachos` | Salidas, transportadora, guía, costo de envío y entrega. |
| **Balances** | `/admin/balances` | Rentabilidad por venta, cuentas (caja/banco/wallet), movimientos y costos logístico-financieros. |
| **Gastos** | `/admin/gastos` | Gastos operativos por categoría y cuenta (nómina, marketing, varios, etc.). |
| **Transporte** | `/admin/transporte` | Tipo de envío por ciudad/corregimiento (DANE): Gratis / Adicional / Se cotiza / No llegamos / Automático, y "Pendientes de revisar" (lo nuevo que manda el CRM). El cliente ve el envío gratis en `/cobertura`; el CRM consulta `/api/transporte/ubicaciones`. |
| **Configuración** | `/admin/configuracion/*` | Usuarios y roles, datos del negocio (moneda, marca, color), y control de módulos por rol. |

---

## 3. Stack técnico

- **Next.js 16** (App Router) + **React 19** + **TypeScript**.
- **Prisma 7** con **PostgreSQL** (adapter `@prisma/adapter-pg` sobre `pg.Pool`, vía `DATABASE_URL`).
- **next-auth v5** (credenciales email/contraseña, `bcryptjs`) para autenticación y sesión.
- **Tailwind CSS v4** + componentes propios estilo shadcn/base-ui/radix; iconos `lucide-react`.
- **TanStack Table** para tablas; **Zod** para validación; **react-hook-form** en formularios.
- **Puppeteer + Chromium del sistema** para generar PDFs (cotización y factura).
- **Nodemailer** (SMTP) para correos (verificación de email, informes).
- **Recharts** para gráficas; **react-toastify** para notificaciones.
- Pruebas con **Vitest** (`npm run test`).

**Patrón de arquitectura.** El código de dominio está organizado en módulos hexagonales dentro de
`src/modules/<modulo>/{domain,application,infrastructure,presentation}` (ej. `balances`, `expenses`,
`inventory`, `transporte`). La UI usa **Server Components** para cargar datos y **Server Actions**
(`src/app/actions/*.ts`) para mutar. Helpers compartidos en `src/lib/`.

---

## 4. Roles, rutas y autenticación

**Roles** (`Role`): `ADMIN`, `EMPLEADO`, `CLIENTE`. El acceso a cada módulo del admin se decide en
`src/lib/admin-module-access.ts` (`hasAdminModuleAccess`), configurable por rol desde
*Configuración → Control de módulos* (se guarda en la tabla `AppSetting`).

**Grupos de rutas** (`src/app/`):

- `(workspace)/` → panel interno bajo `/admin/...` (requiere sesión; casi todo es solo `ADMIN`).
  Aplica el tema claro/oscuro (por defecto **claro**); la tienda pública siempre es clara.
- `(storefront)/` → tienda pública con `Navbar` + `SiteFooter`: inicio `/`, `/catalogo`,
  categoría `/[slug]`, producto `/[slug]/[productSlug]`, y páginas legales `/legal/[slug]`.
- Rutas públicas independientes (fuera de los grupos): `/cobertura` (envío gratis por ubicación),
  `/distribuidor` (precios al por mayor), `/informe` (informe mensual con token),
  `/cotizaciones/[token]`, `/sales/[token]`, `/proveedores/[token]`, `/login`, `/register`,
  `/recuperar`, `/restablecer`, `/verify-email`, `/unauthorized`, más `robots.ts`, `sitemap.ts` y
  `opengraph-image.tsx`.

Los enlaces `token`/`shareToken` permiten abrir una cotización, una factura de venta o la cuenta de
un proveedor **sin iniciar sesión** (acceso por enlace secreto).

---

## 5. Modelo de datos (tablas principales)

Definido en `prisma/schema.prisma` (PostgreSQL). Dinero como `Decimal`; ids `cuid()`. Resumen por área:

### Personas y catálogo
- **User** — usuarios (admin, empleados y clientes). Los clientes se crean al cotizar. Guarda datos de
  contacto y ubicación. Es el actor de casi todo (creó tal cotización, venta, gasto, etc.).
- **Product** — producto del catálogo. Campos clave: `price` (precio final retail), `baseCost` (costo
  de proveedor), `additionalCost` (flete/transporte por unidad), `retailMarginPct` / `wholesaleMarginPct`,
  `wholesalePrice`, `minWholesaleQty`, `minStock`, `isBundle` (es combo), `hiddenFromStore` (oculto de la
  tienda), `slug`, `code`, `shippingExtra` (envío ADICIONAL propio en COP, opcional; pisa el de la
  categoría). Un producto puede tener imágenes, proveedores y componentes.
- **ProductImage** — imágenes del producto (ordenadas).
- **ProductComponent** — composición de un **combo**: qué productos hijo y en qué cantidad forma un
  producto `isBundle`.
- **Category** — categorías del catálogo (con SEO, logo, `isActive`) y `shippingExtra` (envío ADICIONAL
  en COP de sus productos; NULL = se cotiza). Se edita en `/admin/categorias`.
- **ProductReview** — reseñas/valoraciones de productos.
- **Supplier** — proveedores. `type`: `MANUFACTURER` (fábrica) o `SHIPPING` (transportadora).
  `shareToken` para su enlace de cuenta.
- **ProductSupplier** — relación producto↔proveedor con `supplierCost` (costo de ese proveedor) e
  `isPreferred` (proveedor preferido).

### Cotización → Venta
- **Quote** — cotización (`code` `COT-...`, `shareToken`). Tiene ítems y puede convertirse en una venta.
- **QuoteItem** — línea de cotización: producto, cantidad, `unitPrice`, `fulfillmentMode`
  (`STOCK`/`MANUFACTURE`/`MIXED`), proveedor sugerido.
- **Sale** — venta (`code` `SAL-...`, `invoiceToken`). Estado `SaleStatus`:
  `DRAFT`/`ACTIVE`/`INVOICED`/`COMPLETED`/`CANCELLED`. `total` es el valor a cobrar; guarda comprobantes
  de pago. **`INVOICED` = totalmente pagada** (ver sección 6).
- **SalePayment** — abonos/pagos de una venta (método, fecha, comprobante, cuenta que recibe el dinero).
- **ShippingCost** — **costo de envío por venta** (transportadora + monto). Es el "COSTO DE ENVÍO" que
  reduce la ganancia de esa venta (ej. flete a otra ciudad).

### Cumplimiento: órdenes, producción, despacho
- **Order** — orden. `type`: `SALE` (cumplir una venta al cliente) o `PURCHASE` (compra a proveedor).
  Estado `OrderStatus`: `DRAFT`/`RELEASED`/`IN_PRODUCTION`/`READY_FOR_DISPATCH`/`DISPATCHED`/`COMPLETED`/
  `CANCELLED`. `completedAt` marca la entrega. `purchaseCode` (`COM-...`) agrupa una compra directa.
- **OrderItem** — línea de la orden: producto, cantidad, `unitPrice`, `fulfillmentMode`,
  `confirmedSupplierId`, **`purchaseCost`** (costo real de compra confirmado para ese ítem),
  `supplierPaymentStatus`. Es la base del costo real de la venta.
- **OrderItemPhoto** — fotos del ítem (evidencia de fabricación/estado).
- **OrderStatusHistory** — historial de cambios de estado de una orden. La **última entrada a
  `COMPLETED`** define la **fecha de entrega** usada para reconocer ingresos por mes.
- **ProductionJob** — trabajo de fabricación (`code`, estado `ProductionJobStatus`, asignado a alguien).
- **Dispatch** — despacho/entrega: `deliveryType` (`COUNTER`/`PICKUP`/`SHIPPING`), transportadora,
  `shippingCost`, guía, direcciones y fotos de entrega.
- **DispatchItem** — qué ítems y cuánto se despachan; reparte el costo de envío entre productos.

### Proveedores (cuenta corriente) e inventario
- **SupplierLedgerEntry** — movimientos de la cuenta del proveedor: `CHARGE` (lo que le debemos) o
  `PAYMENT` (abono). Puede ligarse a una venta, orden, ítem, despacho o movimiento de inventario.
  `settlesEntryId` indica qué cargo salda un abono. `code` `INV-...` para cargos de inventario.
- **InventoryMovement** — movimiento de stock (`IN`/`OUT`/`ADJUSTMENT`) con `change` (con signo).
  `purchaseCode` (`COM-...`) agrupa los movimientos de una compra directa (permite revertirla).

### Dinero del negocio: cuentas, gastos, cierres
- **Account** — cuentas de dinero (`CASH`/`BANK`/`WALLET`/`OTHER`) con `openingBalance`. A ellas entran
  pagos de ventas y salen pagos a proveedores, envíos y gastos.
- **AccountMovement** — movimientos manuales de una cuenta (`IN`/`OUT`/`TRANSFER`). `transferId` agrupa
  las dos patas de una transferencia entre cuentas.
- **ExpenseCategory** — categorías de gasto (nómina, marketing, varios, servicios, etc.).
- **Expense** — gasto operativo (categoría, cuenta que paga, monto, fecha, comprobante, empleado).
- **MonthClosure** — cierre de mes: foto congelada del resumen (ventas, costos, envíos, gastos,
  utilidad, margen) que se comparte por correo.

### Transversal y configuración
- **ActivityLog** — bitácora de auditoría (quién creó/editó/borró qué).
- **AppSetting** — clave→valor para configuración del sistema (moneda, marca, color primario, teléfono
  WhatsApp, logo, textos de la tienda, márgenes mínimos, UVT DIAN, control de módulos por rol, token del
  informe, etc.).

### Transporte (cobertura DANE)
- **TransportDepartment / TransportCity / TransportLocality** — división político-administrativa oficial
  de Colombia (DANE DIVIPOLA): 33 departamentos, ~1.122 municipios y ~7.057 corregimientos/centros
  poblados. Los datos se cargan de forma perezosa desde un JSON empaquetado la primera vez que se usa
  el módulo (`ensureTransportSeed`, que también llena `nameKey`).
- Campos de envío (migración `20261006230000_envios_por_ubicacion_y_producto`):
  - `shippingType` (enum `ShippingType`: `GRATIS`/`ADICIONAL`/`COTIZAR`/`NO_LLEGA`, NULL = automático).
    Tipo efectivo (`resolveShippingType` en `src/modules/transporte/domain/shipping.ts`): el propio; si
    no, el de la ciudad (corregimientos); si no, `freeShipping` true → GRATIS, false → COTIZAR.
  - `freeShipping`: lo sigue usando `/cobertura`; al guardar un tipo se sincroniza (GRATIS → true, otro →
    false). "Automático" no lo toca.
  - `nameKey`: nombre sin acentos y en minúsculas (`normalizePlaceName`) para buscar y no duplicar
    (índices NO únicos; la no-duplicación se controla en código).
  - `needsReview` + `source` (`DANE`/`CRM`/...): lo que agrega el CRM entra como corregimiento con
    código `CRM-<ciudad>-<nombre>` y `needsReview=true`; aparece en "Pendientes de revisar" y se limpia
    al guardarle un tipo.
- **Búsqueda por nombre** (panel y `/api/transporte/ubicaciones`): orden puro en
  `src/modules/transporte/domain/place-search.ts` (`rankPlaces`). Alias de nombre común → ciudad DANE
  (`CITY_ALIASES`: "cali" → Santiago de Cali, "bogota" → Bogotá, D.C., "cucuta", "cartagena", "buga",
  "tumaco"...) va primero; luego exacta > palabra completa > empieza por > contiene; a igual puntaje
  ciudades, capitales (código `DD001`) y alfabético. `exacta` en la API incluye el alias.
- **Total con envío** (`quoteShipping`): GRATIS → precio; ADICIONAL → precio + `Product.shippingExtra`
  (o `Category.shippingExtra`); si no hay valor cargado → se cotiza (nunca se inventa); COTIZAR/NO_LLEGA
  → sin total.

### Flujo de negocio (resumen)
`Cotización (COT)` → se convierte en `Venta (SAL)` → genera una `Orden de venta` → (`Producción` si es
fabricación) → `Despacho` → la orden llega a `COMPLETED` (entrega). En paralelo, las `Órdenes de compra`
y las **compras directas** de inventario mueven stock y generan cargos en la cuenta del proveedor, que se
saldan con abonos (`SupplierLedgerEntry`).

---

## 6. Cómo se calculan márgenes y ganancia por venta

Hay **dos cálculos distintos**:

### a) Precio y margen del producto (catálogo) — `src/lib/pricing.ts`
- `precio = baseCost * (1 + margen% / 100)` (`calculateRetailPrice` / `calculateWholesalePrice`).
- `margen% = (precioFinal − baseCost) / baseCost * 100` (`calculateMarginPctFromPrice`).
- Redondeo a 2 decimales (`roundMoney`).

Aquí el "costo" es el costo del producto en el catálogo; sirve para sugerir precios al crear/editar.

### b) Ganancia real por venta (Balances / informe)
Vive en `src/modules/balances/domain/calculations.ts` con el helper de costo unitario
`src/lib/order-item-cost.ts` (`computeItemUnitCost`). Por cada **ítem de la orden** el costo unitario es:

1. Si el ítem tiene `purchaseCost` (costo de compra confirmado en la orden) → **ese** valor.
2. Si no, y el ítem es **STOCK** → `baseCost + additionalCost` (costo de inventario + flete del producto).
3. Si no → costo del proveedor preferido, o `baseCost` como último recurso.

Con eso:

```
costosProveedor = Σ (costoUnitario × cantidad)      // por todos los ítems de la venta
costosEnvio     = Σ ShippingCost.amount de la venta  // "COSTO DE ENVÍO" por venta
gananciaNeta    = valorVenta − costosProveedor − costosEnvio
margen%         = gananciaNeta / valorVenta × 100
```

**Reconocimiento por fecha de ENTREGA (no por fecha de creación).** Una venta se cuenta en el mes en que
su orden llegó a `COMPLETED` (la última entrada `COMPLETED` de `OrderStatusHistory`; si no hay,
`order.completedAt`). Así, si se vende en un mes y se entrega en otro, la utilidad cae en el mes de
entrega. El filtrado por periodo se hace en JS para ser robusto ante deshacer/rehacer estados
(`src/modules/balances/infrastructure/prisma-balances-repository.ts`).

**Qué ventas entran** al dashboard/informe: ventas **`INVOICED`** (totalmente pagadas) cuya orden está
**`COMPLETED`**. Una venta pasa a `INVOICED` cuando **lo pagado (inicial + abonos) ≥ `sale.total`**
(ver `src/app/actions/sales-actions.ts`); si luego se elimina un pago y baja de ese umbral, vuelve a
`ACTIVE`.

El **informe mensual** (`src/lib/monthly-report.ts`) reutiliza esta lógica y agrega: total y # de
pedidos entregados, utilidad y margen, top 5 productos por ventas y por margen, y cotizaciones
hechas/cerradas.

---

## 7. Rutas de API existentes (hoy)

Route handlers reales (`route.ts`):

| Ruta | Método | Qué hace | Acceso |
|---|---|---|---|
| `/api/auth/[...nextauth]` | GET/POST | Login, sesión y callbacks de next-auth. | Público (auth) |
| `/api/generate-quote-pdf` | POST/GET | Genera el **PDF de una cotización** (Puppeteer + Chromium). | Interno |
| `/api/generate-sale-invoice-pdf` | POST/GET | Genera el **PDF de factura/comprobante** de una venta. | Interno |
| `/api/informe` | GET | **Informe mensual en JSON**. Requiere `?token=...&month=YYYY-MM`. | Token |
| `/api/informe/link` | GET | Devuelve el enlace del informe con su token listo para copiar. | Solo `ADMIN` |
| `/uploads/[...path]` | GET | Sirve archivos subidos (comprobantes, imágenes) desde el volumen. | Público (ruta) |
| `/verify-email` | GET | Verifica el correo del usuario mediante token. | Público (token) |
| `/admin/productos/export` | GET | Exporta el catálogo de productos a **CSV**. | Solo `ADMIN` |
| `/api/mcp` | POST | **Servidor MCP de solo lectura** para el asesor de IA (ver abajo). | Llave `MCP_API_KEY` |
| `/api/mcp/[key]` | POST | Lo mismo, con la llave dentro de la ruta (clientes sin headers, ej. claude.ai). | Llave en la URL |
| `/api/catalogo/productos` | GET | **Catálogo para otras apps** (el CRM se sincroniza desde acá): código, nombre, descripción, categoría, precio, precio mayorista, imágenes (URL absoluta) y si está oculto. **Nunca costo ni margen.** Módulo `src/modules/catalogo-externo`. | Llave `CATALOGO_API_KEY` (o `MCP_API_KEY` si no existe) |
| `/api/transporte/ubicaciones` | GET/POST | **Envíos para el CRM.** GET `?q=&producto=&limit=` (q normalizado ≥ 2, limit 1..50, def. 20) → `{ resultados: [{ tipo, id, cityId, nombre, ciudad, departamento, envio, pendienteRevision, exacta, cotizacion }], producto }`; `cotizacion` (`{tipo, envio, total}`) solo si vino `producto` y existe. POST `{ cityId, nombre (2..80), origen? }` → 201 `{creado:true,id,nombre}` / 200 `{creado:false,...}` si ya existía / 404 ciudad no encontrada; lo nuevo queda "pendiente de revisar". El CRM ya está programado contra este contrato: **no cambiarlo**. | Llave `TRANSPORTE_API_KEY` (si no, `CATALOGO_API_KEY`, si no `MCP_API_KEY`) |

### Servidor MCP del asesor de IA (`/api/mcp`)
- Transporte **Streamable HTTP** sin sesión: cada `POST` trae un mensaje JSON-RPC (o lote) y se
  responde con `application/json`. `GET`/`DELETE` → 405. Sin llave válida → **401**.
- Llave en `Authorization: Bearer <MCP_API_KEY>`, `x-api-key` o **en la ruta** `/api/mcp/<llave>`
  (para conectores de claude.ai, igual que el MCP de AizenCRM). Mínimo 24 caracteres; si la variable
  no está configurada, nadie entra. La variante en la ruta deja la llave en logs del proxy: si se
  filtra, se cambia `MCP_API_KEY`. Las dos rutas comparten `presentation/mcp/http.ts`.
- **Solo lectura**: módulo `src/modules/asesor` (hexagonal). Sus puertos solo tienen métodos de
  consulta; la ganancia por venta y el resumen del mes **reutilizan los casos de uso de Balances**.
- Herramientas: `resumen_del_mes`, `listar_ventas`, `listar_cotizaciones`, `listar_productos`,
  `comisiones_del_mes` y `que_es_esta_aplicacion`. Mismo criterio que Balances (ventas pagadas y
  entregadas, por fecha de entrega). "Vendedora" = quien creó la cotización (no existe un campo
  propio); "origen" no existe.
- Comisiones: 10% de la ganancia en la primera venta del mes de cada vendedora, 15% desde la segunda,
  en orden de fecha de entrega; ganancia ≤ 0 no genera comisión.

### Radiografía de la app (`que_es_esta_aplicacion`)
Devuelve qué hace la app, stack y despliegue, módulos y casos de uso, modelo de datos, rutas, reglas
de negocio (con su código), lo que no tiene y riesgos de operación. Parámetro opcional `seccion`.
Tiene **tres fuentes**, y la respuesta dice de cuál salió cada cosa (`fuentes`):

1. **En vivo** (dentro del contenedor): `prisma/schema.prisma` (entidades, relaciones, enums),
   `prisma/migrations`, `package.json` + `node_modules` (versiones instaladas), conteo de registros en
   la base y constantes del código (módulos del panel, estados, comisiones).
2. **Foto del build** `.next/gestion-snapshot.json`: el código fuente no viaja en la imagen, así que
   `scripts/generate-app-snapshot.mjs` (en `postbuild`; también `npm run snapshot`) lee el repo en
   cada build: rutas de `src/app`, módulos y casos de uso, acciones de servidor, Dockerfile, workflow,
   docker-compose (solo **nombres** de variables, nunca valores) y el **código** de las reglas listadas
   en `CODE_RULES`. Si se renombra una de esas funciones, la foto lo marca en `avisos`. Nunca rompe el
   build. `.dockerignore` excluye `.git`, así que en producción la foto no trae el commit (sí la fecha).
3. **Documento editable** `docs/asesor/gestion.md`: lo que no se deduce del código (qué hace, problema
   de negocio, descripción de módulos, entidades y pantallas, reglas en lenguaje claro, lo que no
   tiene, riesgos no deducibles). Títulos `##` fijos; listas `- \`nombre\`: descripción`. Lo que falte
   aparece en `pendiente_de_documentar`. **Al agregar una entidad, módulo o pantalla, descríbela ahí.**

Los riesgos de configuración (migraciones que bloquean el arranque, pipeline sin pruebas, una réplica,
etiqueta `latest`, volumen atado al nodo) se **detectan solos** desde el Dockerfile, el workflow y el
compose (`detectOperationalRisks`).

**Importante:** casi toda la mutación de datos **no** usa API REST, sino **Server Actions** en
`src/app/actions/*.ts` (p. ej. `product-actions`, `sales-actions`, `quote-actions`, `inventory-actions`,
`balances-actions`, `expenses-actions`, `dispatch-actions`, `transporte-actions`, `settings-actions`,
`auth-actions`). Las páginas públicas interactivas (como `/cobertura`) usan **server actions públicas**
en vez de endpoints REST. El **token del informe** se deriva de `AUTH_SECRET` si no se define
`MONTHLY_REPORT_TOKEN` (`reportToken()` en `src/lib/monthly-report.ts`).

---

## 8. Configuración del sistema y páginas públicas destacadas

- **Configuración** (tabla `AppSetting`, helpers en `src/lib/system-settings.ts`): moneda, nombre de
  marca, color primario, teléfono/WhatsApp, logo, textos y promos de la tienda, márgenes mínimos, UVT de
  la DIAN y control de módulos por rol.
- **`/informe`** — informe mensual (página + JSON) protegido por token; pensado para leerse por un agente
  o compartir un resumen del mes.
- **`/cobertura`** — el cliente elige departamento → ciudad → corregimiento y ve si tiene **envío gratis**;
  si no, botón para cotizar por WhatsApp. Soporta `?ref=1`/`?ref=2` para usar distintos números de
  WhatsApp por línea de venta. Incluye mapas de las sedes.
- **`/distribuidor`** — lista de **precios al por mayor**.
- **`/legal/[slug]`** — páginas legales base (privacidad, términos, tratamiento de datos, garantía).

---

## 9. Cómo se despliega

**Flujo automático:** `git push` a la rama **`main`** → **GitHub Actions**
(`.github/workflows/docker-image.yml`) construye la imagen Docker y la publica en **GHCR**
(`ghcr.io/alexmorer/gestion:latest`) → dispara un **webhook de Portainer** (secret `PORTAINER_GESTION`)
que **redespliega** el stack automáticamente. No hay que hacer nada manual.

**Imagen (Dockerfile, multi-stage sobre `node:20-alpine`):**
- Usa el **Chromium del sistema** (no el de Puppeteer) para los PDFs.
- Zona horaria fija **`America/Bogota`** (clave para que las fechas y el agrupamiento por mes cuadren).
- Comando de arranque: **`npx prisma migrate deploy && npm run start`** → las **migraciones de Prisma se
  aplican solas** al arrancar el contenedor. Por eso, para cambios de base de datos basta con crear la
  migración en `prisma/migrations/` y hacer push.

**Orquestación (`docker-compose.portainer.yml`, Docker Swarm + Traefik):**
- Un servicio réplica en el nodo manager, detrás de **Traefik** (TLS Let's Encrypt) en
  `magilus.com` / `www.magilus.com`, puerto interno `3000`.
- Volumen persistente **`magilus_uploads`** montado en `/app/public/uploads` (los archivos subidos no se
  pierden entre despliegues).
- Variables de entorno del stack: `DATABASE_URL`, `AUTH_URL`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_APP_URL`,
  `AUTH_SECRET` (requerido por next-auth), SMTP (`SMTP_HOST/PORT/SECURE/USER/PASS/FROM`) para correos,
  `MONTHLY_REPORT_TOKEN` (opcional) y `MCP_API_KEY` (llave del servidor MCP `/api/mcp`).

**Dónde viven de verdad las variables (importante):**
- `docker-compose.portainer.yml` del repo es solo **referencia**. El stack real `magilus_app` es un stack
  de editor web de Portainer: su compose está en el servidor en
  `/var/lib/docker/volumes/portainer_data/_data/compose/10/docker-compose.yml`, con los valores
  **escritos directamente** (no `${VAR}`).
- El despliegue automático (webhook de **servicio**) solo vuelve a bajar la imagen y **reutiliza la
  especificación actual del servicio Swarm** `magilus_app_magilus_app`, incluidas sus variables.
- Para agregar o cambiar una variable de forma que no se pierda: ponerla **en los dos lugares** —
  `docker service update --env-add NOMBRE=valor magilus_app_magilus_app` (lo usa cada push) y una línea
  en el compose de Portainer (lo usa "Update the stack"). Hacer copia del compose antes de editarlo.
- En ese servidor corren también otros stacks (AizenCRM, Postgres, Traefik, Portainer): tocar solo
  `magilus_app`.

---

## 10. Convenciones y notas para trabajar en el repo

- **Rama y despliegue:** trabajar y hacer push a `main` despliega a producción. Verificar con
  `npx tsc --noEmit` y `npm run build` antes de subir.
- **Migraciones:** escribir la SQL a mano en una carpeta nueva `prisma/migrations/<timestamp>_<nombre>/`
  y ejecutar `npx prisma generate`. Se aplican solas en el arranque (no hay `prisma migrate dev` contra
  producción). No existe archivo `prisma/seed.ts`: los datos de referencia se siembran de forma perezosa
  en código (p. ej. categorías de gasto o los datos DANE de transporte).
- **Zona horaria:** el servidor corre en `America/Bogota`; las fechas "de calendario" (fecha de gasto,
  entrega, etc.) se manejan con cuidado para no correrse de día/mes.
- **Fechas de negocio:** los ingresos/ganancias se reconocen por **fecha de entrega** (orden
  `COMPLETED`), no por fecha de creación de la venta.
- **Archivos subidos:** viven en `/public/uploads` (volumen persistente) y se sirven por
  `/uploads/[...path]`.
- **Auditoría:** las acciones importantes registran `ActivityLog`.
- **Pruebas:** `npm run test` (Vitest). Nota: dentro de `src/modules/*/domain` se usan imports relativos
  a `src/lib` porque el alias `@/` no lo resuelve Vitest.
