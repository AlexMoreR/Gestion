import "server-only";
import { prisma } from "@/lib/prisma";
import { partesParaRecolorear, resolverPartes, textoColores, type ParteElegida } from "@/lib/product-parts";
import { separarImagenes } from "@/lib/product-fichas";
import { recolorear } from "@/lib/recolor-image.server";
import { recolorConIa } from "@/lib/recolor-ia.server";

// Imagen con los colores elegidos (nov-2026). Único lugar que la genera: cotización (crear/editar),
// vista previa del editor y «Cambiar color». Nunca rompe: si algo falla devuelve "" (Sin vista previa).
// Llamar fuera de transacciones: puede tardar (sharp).

const partesSelect = {
  orderBy: { orden: "asc" as const },
  select: { nombre: true, tipo: true, mascaraUrl: true, acabadosHex: true, orden: true },
};

/** URL /uploads/vista-color/... de la portada del producto pintada con sus partes, o "" si no se puede. */
export async function imagenDeColores(productId: string, partes: ParteElegida[]): Promise<string> {
  if (!productId || partes.length === 0) return "";
  try {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: {
        images: { orderBy: { order: "asc" }, select: { url: true, tipo: true, order: true } },
        partesColor: partesSelect,
        category: { select: { partesColor: partesSelect } },
      },
    });
    const portada = product ? separarImagenes(product.images).fotos[0] : undefined;
    if (!product || !portada) return "";
    const lista = partesParaRecolorear(resolverPartes(product.category?.partesColor ?? [], product.partesColor), partes);
    const hecha = lista ? await recolorear({ fotoBase: portada.url, partes: lista }) : null;
    if (hecha) return hecha.url;
    return (await recolorConIa({ productId, fotoUrl: portada.url, texto: textoColores(partes) })) ?? "";
  } catch (error) {
    console.error("Vista de color: no se pudo generar la imagen:", error);
    return "";
  }
}

export type LineaConPartes = { productId: string; comboCode?: string | null; partes: ParteElegida[] };

/**
 * Imagen de cada línea (mismo orden; "" si no tiene partes). En un combo desglosado las partes son del
 * combo (por su código), no de la pieza. Las líneas iguales (piezas de un combo) se generan una vez.
 */
export async function imagenesDeLineas(lineas: LineaConPartes[]): Promise<string[]> {
  const conPartes = lineas.filter((l) => l.partes.length > 0);
  if (conPartes.length === 0) return lineas.map(() => "");
  const codigos = [...new Set(conPartes.map((l) => l.comboCode?.trim() ?? "").filter(Boolean))];
  const combos = codigos.length
    ? await prisma.product.findMany({ where: { code: { in: codigos } }, select: { id: true, code: true } }).catch(() => [])
    : [];
  const idPorCodigo = new Map(combos.map((c) => [c.code, c.id]));
  const duenio = (l: LineaConPartes) => (l.comboCode?.trim() && idPorCodigo.get(l.comboCode.trim())) || l.productId;
  const llave = (l: LineaConPartes) => JSON.stringify([duenio(l), l.partes]);

  const pendientes = new Map<string, Promise<string>>();
  for (const l of conPartes) {
    if (!pendientes.has(llave(l))) pendientes.set(llave(l), imagenDeColores(duenio(l), l.partes));
  }
  return Promise.all(lineas.map((l) => (l.partes.length > 0 ? pendientes.get(llave(l))! : Promise.resolve(""))));
}
