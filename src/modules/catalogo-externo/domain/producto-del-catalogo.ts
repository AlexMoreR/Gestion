import { getActivePromo, getCurrentStorePrice, getNormalPrice, toBogotaDateOnly } from "../../../lib/product-promo";
import { buildProductPath, buildProductSlug } from "../../../lib/product-slugs";
import { soloFotos } from "../../../lib/product-fichas";
import { getSiteUrl } from "../../../lib/site";

/**
 * Armado del producto que sale por /api/catalogo/productos (reglas puras, sin Prisma).
 *
 * CONTRATO: AizenCRM (AgenteLite/src/lib/sincronizacion-gestion.ts) y NETMAGI
 * (messenger-basic/crm-api/publicaciones/fuentes.js) leen estos campos. Los campos viejos
 * (id ... actualizado_el) NO se cambian ni se quitan: solo se agregan nuevos al final.
 *
 * La lista de campos es EXPLICITA: costo, margenes, costo adicional y proveedores no salen nunca.
 */

export type FotoDelCatalogo = {
  /** URL absoluta (https://magilus.com/uploads/...). */
  url: string;
  /** Orden de la foto en la ficha (0 = principal). */
  orden: number;
};

export type OfertaDelCatalogo = {
  precio: number;
  precio_normal: number;
  /** AAAA-MM-DD, hora de Colombia. */
  desde: string;
  hasta: string;
};

export type ProductoDelCatalogo = {
  id: string;
  codigo: string | null;
  nombre: string;
  descripcion: string | null;
  categoria: string | null;
  precio: number;
  /** 0 = sin precio mayorista. */
  precio_mayorista: number;
  cantidad_minima_mayorista: number;
  es_combo: boolean;
  oculto: boolean;
  /** En orden; la primera es la principal. */
  imagenes: string[];
  actualizado_el: string;
  // --- Agregados (fase 4, 22-oct-2026) ---
  slug: string;
  /** URL publica de la ficha en la tienda. */
  url: string;
  categoria_slug: string | null;
  /** Precio que la tienda muestra hoy: el de oferta si esta vigente; si no, `precio`. */
  precio_vigente: number;
  /** Precio normal (regularPrice si esta cargado; si no, `precio`). */
  precio_normal: number;
  /** Solo si hay oferta vigente hoy. */
  oferta: OfertaDelCatalogo | null;
  /** Fotos de la ficha en orden. */
  fotos: FotoDelCatalogo[];
};

/** Lo que se lee de la base para armar un producto. */
export type ProductoFuente = {
  id: string;
  code: string | null;
  slug: string;
  name: string;
  description: string | null;
  price: unknown;
  regularPrice: unknown;
  promoPrice: unknown;
  promoStartsAt: Date | null;
  promoEndsAt: Date | null;
  wholesalePrice: unknown;
  minWholesaleQty: number;
  isBundle: boolean;
  hiddenFromStore: boolean;
  thumbnailUrl: string | null;
  updatedAt: Date;
  category: { name: string; slug: string } | null;
  // tipo: "foto" | "ficha" (sin tipo = foto). Las fichas se descartan aqui tambien, por si acaso.
  images: { url: string; order: number; tipo?: string | null }[];
};

export function urlAbsoluta(ruta: string | null | undefined): string | null {
  const limpia = ruta?.trim() ?? "";
  if (!limpia || limpia === "/file.svg") {
    // `/file.svg` es el relleno que pone la importacion por CSV cuando no hay foto: no es una foto.
    return null;
  }
  if (/^https?:\/\//i.test(limpia)) {
    return limpia;
  }
  return getSiteUrl(limpia.startsWith("/") ? limpia : `/${limpia}`);
}

function armarFotos(producto: ProductoFuente): FotoDelCatalogo[] {
  const fotos: FotoDelCatalogo[] = [];
  const vistas = new Set<string>();
  for (const imagen of soloFotos(producto.images).sort((a, b) => a.order - b.order)) {
    const url = urlAbsoluta(imagen.url);
    if (url && !vistas.has(url)) {
      vistas.add(url);
      fotos.push({ url, orden: imagen.order });
    }
  }
  // Sin galeria: la miniatura es la unica foto.
  if (fotos.length === 0) {
    const miniatura = urlAbsoluta(producto.thumbnailUrl);
    if (miniatura) fotos.push({ url: miniatura, orden: 0 });
  }
  return fotos;
}

export function armarProductoDelCatalogo(producto: ProductoFuente, ahora: Date = new Date()): ProductoDelCatalogo {
  const imagenes = [producto.thumbnailUrl, ...soloFotos(producto.images).map((imagen) => imagen.url)]
    .map(urlAbsoluta)
    .filter((url): url is string => Boolean(url));
  const promo = getActivePromo(producto, ahora);
  const codigo = producto.code?.trim() || null;
  const categoriaSlug = producto.category?.slug?.trim() || null;
  const fuenteSlug = { id: producto.id, slug: producto.slug, name: producto.name, code: codigo };

  return {
    id: producto.id,
    codigo,
    nombre: producto.name,
    descripcion: producto.description?.trim() || null,
    categoria: producto.category?.name ?? null,
    precio: Number(producto.price),
    precio_mayorista: Number(producto.wholesalePrice),
    cantidad_minima_mayorista: producto.minWholesaleQty,
    es_combo: producto.isBundle,
    oculto: producto.hiddenFromStore,
    // Sin repetidas: la miniatura suele ser tambien la primera imagen.
    imagenes: [...new Set(imagenes)],
    actualizado_el: producto.updatedAt.toISOString(),
    slug: buildProductSlug(fuenteSlug),
    url: getSiteUrl(buildProductPath({ ...fuenteSlug, category: categoriaSlug ? { slug: categoriaSlug } : null })),
    categoria_slug: categoriaSlug,
    precio_vigente: getCurrentStorePrice(producto, ahora),
    precio_normal: getNormalPrice(producto),
    oferta: promo
      ? {
          precio: promo.promoPrice,
          precio_normal: promo.normalPrice,
          desde: toBogotaDateOnly(promo.startsAt) ?? "",
          hasta: toBogotaDateOnly(promo.endsAt) ?? "",
        }
      : null,
    fotos: armarFotos(producto),
  };
}

// --- Filtros por query ---

export type FiltrosDelCatalogo = {
  /** Codigo exacto, sin distinguir mayusculas. */
  codigo?: string;
  /** Slug de la categoria. */
  categoriaSlug?: string;
  /** Por defecto true (asi era antes de los filtros). */
  incluirOcultos: boolean;
};

const SI = new Set(["1", "true", "si", "sí"]);
const NO = new Set(["0", "false", "no"]);

/** Lee ?code=, ?categoria= e ?incluirOcultos=0|1. Devuelve { error } si un valor no sirve. */
export function leerFiltrosDelCatalogo(
  params: URLSearchParams,
): { ok: true; filtros: FiltrosDelCatalogo } | { ok: false; error: string } {
  const codigo = params.get("code")?.trim() || undefined;
  const categoriaSlug = params.get("categoria")?.trim().toLowerCase() || undefined;
  const crudo = params.get("incluirOcultos")?.trim().toLowerCase();

  let incluirOcultos = true;
  if (crudo) {
    if (SI.has(crudo)) incluirOcultos = true;
    else if (NO.has(crudo)) incluirOcultos = false;
    else return { ok: false, error: "incluirOcultos debe ser 0 o 1" };
  }
  return { ok: true, filtros: { codigo, categoriaSlug, incluirOcultos } };
}

/** El `where` de Prisma para los filtros (objeto plano, sin importar Prisma). */
export function whereDeFiltros(filtros: FiltrosDelCatalogo) {
  return {
    ...(filtros.codigo ? { code: { equals: filtros.codigo, mode: "insensitive" as const } } : {}),
    ...(filtros.categoriaSlug ? { category: { slug: filtros.categoriaSlug } } : {}),
    ...(filtros.incluirOcultos ? {} : { hiddenFromStore: false }),
  };
}
