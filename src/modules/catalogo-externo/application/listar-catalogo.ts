import { prisma } from "@/lib/prisma";
import { SOLO_FOTOS } from "@/lib/product-fichas";

import {
  armarProductoDelCatalogo,
  whereDeFiltros,
  type FiltrosDelCatalogo,
  type ProductoDelCatalogo,
} from "../domain/producto-del-catalogo";

export type { ProductoDelCatalogo } from "../domain/producto-del-catalogo";

/**
 * EL CATALOGO PARA OTRAS APPS: lo que el CRM (AizenCRM) y NETMAGI necesitan para vender, y nada mas.
 *
 * Gestion es la fuente de verdad de los productos (Alex, 03-10-2026): el CRM se sincroniza desde
 * aca una vez al dia y con un boton. Por eso la lista de campos es EXPLICITA y no un `select *`:
 * el costo, los margenes, el costo adicional y los proveedores no salen nunca, ni por descuido el
 * dia que alguien agregue una columna nueva. El armado de cada producto esta en
 * ../domain/producto-del-catalogo.ts.
 *
 * Las imagenes salen con URL absoluta (https://magilus.com/uploads/...): la otra app no conoce
 * este dominio, y una ruta relativa ahi no lleva a ningun lado.
 *
 * Un producto borrado aca desaparece de esta lista (no hay borrado suave): el CRM lo deja
 * inactivo al no encontrarlo. Uno oculto de la tienda sale con `oculto: true`.
 */

const SELECT = {
  id: true,
  code: true,
  slug: true,
  name: true,
  description: true,
  price: true,
  regularPrice: true,
  promoPrice: true,
  promoStartsAt: true,
  promoEndsAt: true,
  wholesalePrice: true,
  minWholesaleQty: true,
  isBundle: true,
  hiddenFromStore: true,
  thumbnailUrl: true,
  updatedAt: true,
  category: { select: { name: true, slug: true } },
  // SOLO fotos: NETMAGI publica estas imagenes en Marketplace; una ficha tecnica nunca sale aca.
  images: { where: SOLO_FOTOS, orderBy: { order: "asc" }, select: { url: true, order: true, tipo: true } },
} as const;

/** Sin filtros = todos (tambien los ocultos), como siempre. */
export async function listarCatalogoParaOtrasApps(
  filtros: FiltrosDelCatalogo = { incluirOcultos: true },
): Promise<ProductoDelCatalogo[]> {
  const productos = await prisma.product.findMany({
    where: whereDeFiltros(filtros),
    orderBy: { name: "asc" },
    select: SELECT,
  });
  const ahora = new Date();
  return productos.map((producto) => armarProductoDelCatalogo(producto, ahora));
}

/** Un producto por codigo exacto (sin distinguir mayusculas). Trae tambien los ocultos. */
export async function buscarProductoPorCodigo(codigo: string): Promise<ProductoDelCatalogo | null> {
  const limpio = codigo.trim();
  if (!limpio) return null;
  const producto = await prisma.product.findFirst({
    where: whereDeFiltros({ codigo: limpio, incluirOcultos: true }),
    select: SELECT,
  });
  return producto ? armarProductoDelCatalogo(producto) : null;
}
