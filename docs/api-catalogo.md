# API de catálogo (para otras apps)

Solo lectura. La usan **AizenCRM** (`AgenteLite/src/lib/sincronizacion-gestion.ts`) y **NETMAGI**
(`messenger-basic/crm-api/publicaciones/fuentes.js`). Nunca entrega costo, márgenes ni proveedores.

Código: `src/app/api/catalogo/productos/` (rutas), `src/modules/catalogo-externo/` (lógica).

## Autenticación

- Encabezado `Authorization: Bearer <llave>` o `x-api-key: <llave>`.
- Llave esperada: `CATALOGO_API_KEY`; si no existe, `MCP_API_KEY`.
- Si la llave configurada tiene menos de 24 caracteres, nadie entra.
- Sin llave o llave mala → `401 { "error": "No autorizado" }`.

## `GET /api/catalogo/productos`

Lista de productos ordenada por nombre. Sin parámetros devuelve **todos**, también los ocultos
(igual que antes de los filtros). Sin paginación.

| Parámetro | Valor | Efecto |
|---|---|---|
| `code` | código, ej. `SIL001` | Solo ese código (exacto, sin distinguir mayúsculas). |
| `categoria` | slug de categoría, ej. `sillas-barberas` | Solo esa categoría. |
| `incluirOcultos` | `0` / `1` (también `true`/`false`) | `0` quita los ocultos de la tienda. Por defecto `1`. |

Respuesta `200`:

```json
{
  "generado_el": "2026-10-22T15:00:00.000Z",
  "total": 1,
  "productos": [
    {
      "id": "cm…",
      "codigo": "SIL001",
      "nombre": "Silla barbera",
      "descripcion": "Hidráulica…",
      "categoria": "Sillas",
      "precio": 1200000,
      "precio_mayorista": 1000000,
      "cantidad_minima_mayorista": 3,
      "es_combo": false,
      "oculto": false,
      "imagenes": ["https://magilus.com/uploads/a.jpg", "https://magilus.com/uploads/b.jpg"],
      "actualizado_el": "2026-10-20T10:00:00.000Z",

      "slug": "silla-barbera-sil001",
      "url": "https://magilus.com/sillas-barberas/silla-barbera-sil001",
      "categoria_slug": "sillas-barberas",
      "precio_vigente": 1100000,
      "precio_normal": 1400000,
      "oferta": { "precio": 1100000, "precio_normal": 1400000, "desde": "2026-10-01", "hasta": "2026-10-30" },
      "fotos": [
        { "url": "https://magilus.com/uploads/a.jpg", "orden": 0 },
        { "url": "https://magilus.com/uploads/b.jpg", "orden": 1 }
      ]
    }
  ]
}
```

### Campos

Los campos hasta `actualizado_el` son el contrato original y **no cambian**. Los demás se agregaron
el 22-oct-2026 (fase 4 de la sincronización).

| Campo | Qué es |
|---|---|
| `precio` | Precio detal (`price`). No incluye la oferta. |
| `imagenes` | Miniatura + galería, URL absoluta, sin repetidas, sin `/file.svg`. |
| `oculto` | `true` si está oculto de la tienda (`hiddenFromStore`). |
| `slug` | Slug estable del producto. |
| `url` | Ficha pública: `/<categoria_slug>/<slug>`, o `/productos/<slug>` sin categoría. |
| `categoria_slug` | Slug de la categoría o `null`. |
| `precio_vigente` | Lo que la tienda muestra hoy: el de oferta si está vigente; si no, `precio`. |
| `precio_normal` | `regularPrice` si está cargado; si no, `precio`. |
| `oferta` | `{ precio, precio_normal, desde, hasta }` (fechas AAAA-MM-DD, hora de Colombia) solo si hay oferta vigente hoy; si no, `null`. |
| `fotos` | Galería en orden: `{ url, orden }`. Si no hay galería, la miniatura con `orden: 0`. |

## `GET /api/catalogo/productos/{code}`

Un producto por código exacto (sin distinguir mayúsculas). Incluye ocultos. Mismos campos.

- `200 { "generado_el": "...", "producto": { … } }`
- `404 { "error": "No encontrado", "codigo": "NOP999" }`

## Errores

| Código | Cuándo | Cuerpo |
|---|---|---|
| 400 | `incluirOcultos` con un valor que no es 0/1 | `{ "error": "incluirOcultos debe ser 0 o 1" }` |
| 401 | Sin llave o llave mala | `{ "error": "No autorizado" }` |
| 404 | Código que no existe (ruta por código) | `{ "error": "No encontrado", "codigo": "…" }` |

Todas las respuestas llevan `Cache-Control: no-store`.

## Ejemplos

```bash
curl -H "Authorization: Bearer $CATALOGO_API_KEY" https://magilus.com/api/catalogo/productos
curl -H "x-api-key: $CATALOGO_API_KEY" "https://magilus.com/api/catalogo/productos?categoria=sillas-barberas&incluirOcultos=0"
curl -H "Authorization: Bearer $CATALOGO_API_KEY" https://magilus.com/api/catalogo/productos/sil001
```
