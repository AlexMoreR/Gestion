# Incidentes de despliegue

Un incidente por bloque, el más nuevo arriba: qué pasó, por qué, cómo se arregló y qué cuidar.

## 23-nov-2026 — T-875 «Editar compra con descuento/recargo» no llegó a producción

- **Qué pasó:** a las 5:56 p. m. se subió a `main` el commit `c42a47675f`. GitHub Actions falló, la imagen nueva
  nunca se construyó y el Coordinador lo deshizo solo con `78913af`. Producción siguió con la versión anterior.
- **Por qué:** no fue un error de arranque. Falló el paso `npm run test:db` (prueba con base real) en
  `tests/db/caminos-con-plata.db.test.ts` › «5c. editar una compra con pagos»: T-875 volvió obligatorio el
  «Motivo del cambio» al editar una compra y la prueba seguía llamando `adminUpdateDirectPurchaseAction` sin
  `motivo`, así que la acción respondía «Escribe el motivo del cambio (mínimo 3 letras)».
- **Arreglo:** la prueba 5c manda `motivo` (commit `99ec0d1` en la rama
  `tablero/6b7cu3kd-editar-compra-diseno-limpio-costo-editab`); se trajo `main` y se re-aplicó T-875 deshaciendo
  la reversa. Antes de subir: `npx tsc --noEmit`, `npm test` (1460), `npm run test:db` (56, Postgres local),
  `npm run build` y la app arrancada con `npm run start` abriendo `/admin/ordenes` con sesión de admin.
  Subido a `main` en `703f279`; GitHub Actions en verde y producción arriba con el build de las 6:56 p. m.
  (foto del build de `que_es_esta_aplicacion`).
- **Qué cuidar:** quien construye una tarjeta debe correr también `npm run test:db` (con un Postgres
  desechable), no solo `npm test`: las pruebas de base solo corren en GitHub y ahí frenan el despliegue.

### fecha no registrada · T-875 Gestión no arrancó
<!-- incidente:T-875:fecha no registrada -->

- Repo: gestion (commit c42a476)
- Qué falló: no arrancó
- Causa: causa no registrada
- Qué se intentó: no registrado
- Cómo se resolvió: no registrado
- Regla: Leer los registros completos del servidor y anotar la causa cuando se sepa.

### 2026-11-26 22:36 · rtxzrrm3 Conector Gestión (MCP): poder crear cotizaciones por voz/chat — parte 1: Líneas de cotización con precio, color y adicional dictados
<!-- incidente:rtxzrrm3:2026-11-26 22:36 -->

- Repo: gestion
- Qué falló: el plan nombra archivos que no están en este repo (repo equivocado)
- Causa: El plan nombra archivos que no están en gestion ni en el otro repo: crm-quote-request.test.ts, presentation/crm-quote-http.test.ts
- Qué se intentó: intento 1 de 2 (antes_de_construir; se vuelve a planear)
- Cómo se resolvió: se cambió la tarjeta de repo (o se vuelve a planear) sin construir ni gastar intento
- Regla: Si el plan nombra archivos de otro repo, se cambia la tarjeta de repo y se vuelve a planear; nunca se construye en el repo equivocado.

Líneas del error:

```
no está en gestion: crm-quote-request.test.ts
no está en gestion: presentation/crm-quote-http.test.ts
```

### 2026-11-26 22:38 · rtxzrrm3 Conector Gestión (MCP): poder crear cotizaciones por voz/chat — parte 1: Líneas de cotización con precio, color y adicional dictados
<!-- incidente:rtxzrrm3:2026-11-26 22:38 -->

- Repo: gestion
- Qué falló: el plan nombra archivos que no están en este repo (repo equivocado)
- Causa: El plan nombra archivos que no están en gestion ni en el otro repo: crm-quote-request.test.ts, presentation/crm-quote-http.test.ts, crm-quote-request.ts
- Qué se intentó: intento 2 de 2 (antes_de_construir; se vuelve a planear)
- Cómo se resolvió: se cambió la tarjeta de repo (o se vuelve a planear) sin construir ni gastar intento
- Regla: Si el plan nombra archivos de otro repo, se cambia la tarjeta de repo y se vuelve a planear; nunca se construye en el repo equivocado.

Líneas del error:

```
no está en gestion: crm-quote-request.test.ts
no está en gestion: presentation/crm-quote-http.test.ts
no está en gestion: crm-quote-request.ts
```

### 2026-11-26 22:46 · psnjhep7 Agregar a la T-944: combo de Sandra García (ORD-124) salió de piezas viejas; costo debe quedar en 630.000 (580.000 + 50.000 corsso) y cargarle 50.000 a Laura
<!-- incidente:psnjhep7:2026-11-26 22:46 -->

- Repo: gestion
- Qué falló: el plan nombra archivos que no están en este repo (repo equivocado)
- Causa: El plan nombra archivos que no están en gestion ni en el otro repo: scripts/costo-ord-00124-corsso.mjs, scripts/costo-ord-00124-corsso.test.mjs
- Qué se intentó: intento 1 de 2 (antes_de_construir; se vuelve a planear)
- Cómo se resolvió: se cambió la tarjeta de repo (o se vuelve a planear) sin construir ni gastar intento
- Regla: Si el plan nombra archivos de otro repo, se cambia la tarjeta de repo y se vuelve a planear; nunca se construye en el repo equivocado.

Líneas del error:

```
no está en gestion: scripts/costo-ord-00124-corsso.mjs
no está en gestion: scripts/costo-ord-00124-corsso.test.mjs
```

### 2026-11-27 07:02 · 4hkr1m0s SEO: lista de productos (ItemList) en los datos para Google de cada categoría, unida a la marca
<!-- incidente:4hkr1m0s:2026-11-27 07:02 -->

- Repo: gestion
- Qué falló: el plan nombra archivos que no están en este repo (repo equivocado)
- Causa: El plan nombra archivos que no están en gestion ni en el otro repo: storefront-catalog.tsx
- Qué se intentó: intento 1 de 2 (antes_de_construir; se vuelve a planear)
- Cómo se resolvió: se cambió la tarjeta de repo (o se vuelve a planear) sin construir ni gastar intento
- Regla: Si el plan nombra archivos de otro repo, se cambia la tarjeta de repo y se vuelve a planear; nunca se construye en el repo equivocado.

Líneas del error:

```
no está en gestion: storefront-catalog.tsx
```

### 2026-11-27 07:03 · 6ddktxyc SEO: foto de vista previa liviana (JPEG 1200×630) en fichas y categorías para WhatsApp
<!-- incidente:6ddktxyc:2026-11-27 07:03 -->

- Repo: gestion
- Qué falló: el plan nombra archivos que no están en este repo (repo equivocado)
- Causa: El plan nombra archivos que no están en gestion ni en el otro repo: recolor-image.server.ts, product-seo-content.ts, category-seo-content.ts, robots.txt
- Qué se intentó: intento 1 de 2 (antes_de_construir; se vuelve a planear)
- Cómo se resolvió: se cambió la tarjeta de repo (o se vuelve a planear) sin construir ni gastar intento
- Regla: Si el plan nombra archivos de otro repo, se cambia la tarjeta de repo y se vuelve a planear; nunca se construye en el repo equivocado.

Líneas del error:

```
no está en gestion: recolor-image.server.ts
no está en gestion: product-seo-content.ts
no está en gestion: category-seo-content.ts
no está en gestion: robots.txt
```

### 2026-11-27 21:10 · 37i12brr Editar cotización con abono: la vendedora que la creó agrega o quita productos y se reenvía a la clienta
<!-- incidente:37i12brr:2026-11-27 21:10 -->

- Repo: gestion
- Qué falló: el plan nombra archivos que no están en este repo (repo equivocado)
- Causa: El plan nombra archivos que no están en gestion ni en el otro repo: orders-actions.ts, quote-actions.ts, sale-quote-edit.test.ts
- Qué se intentó: intento 1 de 2 (antes_de_construir; se vuelve a planear)
- Cómo se resolvió: se cambió la tarjeta de repo (o se vuelve a planear) sin construir ni gastar intento
- Regla: Si el plan nombra archivos de otro repo, se cambia la tarjeta de repo y se vuelve a planear; nunca se construye en el repo equivocado.

Líneas del error:

```
no está en gestion: orders-actions.ts
no está en gestion: quote-actions.ts
no está en gestion: sale-quote-edit.test.ts
```

### 2026-11-27 21:14 · 37i12brr Editar cotización con abono: la vendedora que la creó agrega o quita productos y se reenvía a la clienta
<!-- incidente:37i12brr:2026-11-27 21:14 -->

- Repo: gestion
- Qué falló: el plan nombra archivos que no están en este repo (repo equivocado)
- Causa: El plan nombra archivos que no están en gestion ni en el otro repo: quote-wizard-modal.tsx
- Qué se intentó: intento 2 de 2 (antes_de_construir; se vuelve a planear)
- Cómo se resolvió: se cambió la tarjeta de repo (o se vuelve a planear) sin construir ni gastar intento
- Regla: Si el plan nombra archivos de otro repo, se cambia la tarjeta de repo y se vuelve a planear; nunca se construye en el repo equivocado.

Líneas del error:

```
no está en gestion: quote-wizard-modal.tsx
```

### 2026-11-27 22:09 · 37i12brr Editar cotización con abono: la vendedora que la creó agrega o quita productos y se reenvía a la clienta
<!-- incidente:37i12brr:2026-11-27 22:09 -->

- Repo: gestion (commit 4530b4cd1f)
- Qué falló: no arrancó
- Causa: No se pudo saber la causa: los registros no muestran por qué falló. Se subió, no arrancó y se deshizo; producción vuelve a la versión anterior.
- Qué se intentó: intento 1 de 3 (subida a producción)
- Cómo se resolvió: reintento por falla pasajera
- Regla: Leer los registros completos del servidor y anotar la causa cuando se sepa.

Líneas del error:

```
Subió a main (commit 4530b4cd1f) pero el CI falló: ✓ Initialize containers
```

### 2026-11-27 22:17 · 37i12brr Editar cotización con abono: la vendedora que la creó agrega o quita productos y se reenvía a la clienta
<!-- incidente:37i12brr:2026-11-27 22:17 -->

- Repo: gestion (commit e750363c9d)
- Qué falló: no arrancó
- Causa: No se pudo saber la causa: los registros no muestran por qué falló. Se subió, no arrancó y se deshizo; producción vuelve a la versión anterior.
- Qué se intentó: intento 2 de 3 (subida a producción)
- Cómo se resolvió: reintento por falla pasajera
- Regla: Leer los registros completos del servidor y anotar la causa cuando se sepa.

Líneas del error:

```
Subió a main (commit e750363c9d) pero el CI falló: ✓ Initialize containers
```

### 2026-11-27 22:24 · 37i12brr Editar cotización con abono: la vendedora que la creó agrega o quita productos y se reenvía a la clienta
<!-- incidente:37i12brr:2026-11-27 22:24 -->

- Repo: gestion (commit 5ea521ec76)
- Qué falló: no arrancó
- Causa: No se pudo saber la causa: los registros no muestran por qué falló. Se subió, no arrancó y se deshizo; producción vuelve a la versión anterior.
- Qué se intentó: intento 3 de 3 (subida a producción)
- Cómo se resolvió: aviso en Alertas a la 3.ª vez
- Regla: Leer los registros completos del servidor y anotar la causa cuando se sepa.

Líneas del error:

```
Subió a main (commit 5ea521ec76) pero el CI falló: ✓ Initialize containers
```
