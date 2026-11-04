import "server-only";
import type { PrismaClient } from "@prisma/client";
import { leerRecargos, resolverPartes, type ParteParaCotizar } from "@/lib/product-parts";

// Partes de color ya resueltas (propias del producto o, si no tiene, las de su categoría) para
// varios productos con dos consultas. Producto sin partes = lista vacía.
export async function partesPorProducto(
  db: Pick<PrismaClient, "product" | "parteColor">,
  productIds: string[],
): Promise<Map<string, ParteParaCotizar[]>> {
  const ids = [...new Set(productIds)];
  const resultado = new Map<string, ParteParaCotizar[]>();
  if (ids.length === 0) return resultado;

  const productos = await db.product.findMany({ where: { id: { in: ids } }, select: { id: true, categoryId: true } });
  const categoryIds = [...new Set(productos.map((p) => p.categoryId).filter((id): id is string => Boolean(id)))];
  const filas = await db.parteColor.findMany({
    where: { OR: [{ productId: { in: ids } }, ...(categoryIds.length > 0 ? [{ categoryId: { in: categoryIds } }] : [])] },
    select: {
      productId: true,
      categoryId: true,
      nombre: true,
      tipo: true,
      materiales: true,
      acabados: true,
      recargos: true,
      coloresComunes: true,
      orden: true,
    },
  });

  for (const producto of productos) {
    const partes = resolverPartes(
      filas.filter((f) => producto.categoryId && f.categoryId === producto.categoryId),
      filas.filter((f) => f.productId === producto.id),
    );
    resultado.set(
      producto.id,
      partes.map((p) => ({
        nombre: p.nombre,
        tipo: p.tipo,
        materiales: p.materiales,
        acabados: p.acabados,
        recargos: leerRecargos(p.recargos),
        coloresComunes: p.coloresComunes,
      })),
    );
  }
  return resultado;
}
