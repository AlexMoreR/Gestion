import { prisma } from "@/lib/prisma";
import { getSiteUrl } from "@/lib/site";

/**
 * EL CATALOGO PARA OTRAS APPS: lo que el CRM (AizenCRM) necesita para vender, y nada mas.
 *
 * Gestion es la fuente de verdad de los productos (Alex, 03-10-2026): el CRM se sincroniza desde
 * aca una vez al dia y con un boton. Por eso la lista de campos es EXPLICITA y no un `select *`:
 * el costo, los margenes, el costo adicional y los proveedores no salen nunca, ni por descuido el
 * dia que alguien agregue una columna nueva.
 *
 * Las imagenes salen con URL absoluta (https://magilus.com/uploads/...): la otra app no conoce
 * este dominio, y una ruta relativa ahi no lleva a ningun lado.
 *
 * Un producto borrado aca desaparece de esta lista (no hay borrado suave): el CRM lo deja
 * inactivo al no encontrarlo. Uno oculto de la tienda sale con `oculto: true`.
 */

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
};

function urlAbsoluta(ruta: string): string | null {
  const limpia = ruta.trim();
  if (!limpia || limpia === "/file.svg") {
    // `/file.svg` es el relleno que pone la importacion por CSV cuando no hay foto: no es una foto.
    return null;
  }
  if (/^https?:\/\//i.test(limpia)) {
    return limpia;
  }
  return getSiteUrl(limpia.startsWith("/") ? limpia : `/${limpia}`);
}

export async function listarCatalogoParaOtrasApps(): Promise<ProductoDelCatalogo[]> {
  const productos = await prisma.product.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      price: true,
      wholesalePrice: true,
      minWholesaleQty: true,
      isBundle: true,
      hiddenFromStore: true,
      thumbnailUrl: true,
      updatedAt: true,
      category: { select: { name: true } },
      images: { orderBy: { order: "asc" }, select: { url: true } },
    },
  });

  return productos.map((producto) => {
    const imagenes = [producto.thumbnailUrl, ...producto.images.map((imagen) => imagen.url)]
      .map(urlAbsoluta)
      .filter((url): url is string => Boolean(url));
    return {
      id: producto.id,
      codigo: producto.code?.trim() || null,
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
    };
  });
}
