import "server-only";
import { prisma } from "@/lib/prisma";
import { separarImagenes } from "@/lib/product-fichas";
import { partesParaRecolorear, resolverPartes, type ParteElegida } from "@/lib/product-parts";
import { recolorConIa } from "@/lib/recolor-ia.server";
import { recolorear } from "@/lib/recolor-image.server";

// Único lugar que genera la imagen con colores de una línea (cotización, vista previa y «Cambiar color»).
// Nunca falla: si falta portada, máscara o color, o algo se rompe, devuelve "" ("Sin vista previa de color").
// Llamarlo fuera de las transacciones: lee archivos y puede tardar.

const partesSelect = {
  orderBy: { orden: "asc" as const },
  select: { nombre: true, tipo: true, mascaraUrl: true, acabadosHex: true, orden: true },
};

export async function imagenDeColores(productId: string, partes: ParteElegida[]): Promise<string> {
  if (partes.length === 0) return "";
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
    return hecha?.url ?? (await recolorConIa({ productId, fotoBase: portada.url, partes })) ?? "";
  } catch (error) {
    console.warn("[vista-color] no se pudo hacer la imagen", productId, error instanceof Error ? error.message : "");
    return "";
  }
}

/**
 * Una imagen por línea (en el mismo orden). Una línea de combo se pinta con el combo (sus partes y
 * máscaras son las del combo, por su código). Las líneas iguales se hacen una vez.
 */
export async function imagenesDeColores(
  lineas: { productId: string; comboCode?: string | null; partes: ParteElegida[] }[],
): Promise<string[]> {
  const codigos = [...new Set(lineas.filter((l) => l.partes.length > 0 && l.comboCode?.trim()).map((l) => l.comboCode!.trim()))];
  const combos =
    codigos.length > 0
      ? await prisma.product.findMany({ where: { code: { in: codigos } }, select: { id: true, code: true } }).catch(() => [])
      : [];
  const idDeCombo = new Map(combos.map((c) => [c.code, c.id]));
  const porClave = new Map<string, Promise<string>>();
  return Promise.all(
    lineas.map((linea) => {
      if (linea.partes.length === 0) return "";
      const productId = (linea.comboCode?.trim() && idDeCombo.get(linea.comboCode.trim())) || linea.productId;
      const llave = JSON.stringify([productId, linea.partes]);
      if (!porClave.has(llave)) porClave.set(llave, imagenDeColores(productId, linea.partes));
      return porClave.get(llave)!;
    }),
  );
}
