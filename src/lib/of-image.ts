// Cambio de imagen de un producto de la OF (nov-2026): el admin sube una imagen más parecida a lo que se
// debe fabricar y la proveedora la ve en su OF. Vive en las notas de ESA línea de la orden (imageUrl);
// el producto del catálogo, la cotización, los precios y los pagos no se tocan. Aquí solo reglas puras.
import { parseQuoteItemMeta, stringifyQuoteItemMeta } from "./quote-item-meta";

export const OF_IMAGE_MAX_BYTES = 15 * 1024 * 1024;
export const OF_IMAGE_MAX_SIDE = 1600;
export const OF_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const OF_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

type Resultado<T> = { ok: true; value: T } | { ok: false; error: string };

/** Valida tipo y peso del archivo subido (la extensión solo se mira si trae una). */
export function validarArchivoImagenOF(file: { name?: string; type: string; size: number }): Resultado<true> {
  if (!file.size) return { ok: false, error: "Escoge una imagen." };
  if (file.size > OF_IMAGE_MAX_BYTES) return { ok: false, error: "La imagen supera el límite de 15 MB." };
  const nombre = (file.name ?? "").toLowerCase();
  const punto = nombre.lastIndexOf(".");
  const extension = punto >= 0 ? nombre.slice(punto) : "";
  if (!(OF_IMAGE_TYPES as readonly string[]).includes(file.type) || (extension && !OF_IMAGE_EXTENSIONS.includes(extension))) {
    return { ok: false, error: "La imagen no es compatible. Usa JPG, PNG o WEBP." };
  }
  return { ok: true, value: true };
}

/** Imagen puesta a mano en la línea ("" = usa la del catálogo). */
export function imagenManualDe(notes: string | null): string {
  return parseQuoteItemMeta(notes).imageUrl.trim();
}

/** La misma nota con solo la imagen cambiada ("" = vuelve a la del catálogo). Lo demás queda igual. */
export function notesWithOfImage(notes: string | null, url: string): string | null {
  return stringifyQuoteItemMeta({ ...parseQuoteItemMeta(notes), imageUrl: url });
}

/**
 * Qué imagen ve la proveedora: la de colores (rehecha con las partes) sigue de principal; la subida a mano
 * le gana a la del catálogo y, si hay de colores, sale además como referencia al lado.
 */
export function imagenesDeLaLinea(
  meta: { imagenColoresUrl: string; imageUrl: string },
  catalogo: string,
): { principal: string; principalEsColores: boolean; referencia: string } {
  const colores = meta.imagenColoresUrl.trim();
  const manual = meta.imageUrl.trim();
  if (colores) return { principal: colores, principalEsColores: true, referencia: manual };
  return { principal: manual || catalogo, principalEsColores: false, referencia: "" };
}
