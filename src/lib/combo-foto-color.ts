// Foto por color del combo camilla (nov-2026). Reglas puras: la clave de la variante de color y la
// búsqueda EXACTA de su foto. Nunca se devuelve una foto parecida ni la de otro color.
import { POR_DEFINIR, textoColores, type ParteElegida } from "./product-parts";

/** Lo que se lee del meta de cada pieza del combo (parseQuoteItemMeta). */
export type ColoresDeLinea = { color: string; partes: Pick<ParteElegida, "parte" | "color">[] };

const normal = (texto: string) =>
  texto.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

const sinColor = (color: string) => !normal(color) || normal(color) === normal(POR_DEFINIR);

function claveDeLinea(linea: ColoresDeLinea): string | null {
  if (linea.partes.length > 0) {
    if (linea.partes.some((p) => !normal(p.parte) || sinColor(p.color))) return null;
    return linea.partes
      .map((p) => `${normal(p.parte)}=${normal(p.color)}`)
      .sort()
      .join("|");
  }
  return sinColor(linea.color) ? null : `color=${normal(linea.color)}`;
}

/**
 * Clave de la variante: con partes, 'estructura=blanca|tapizado=negro' (partes en orden alfabético);
 * con un solo color, 'color=palo de rosa'. null si no hay piezas, si algo está en Por definir o si
 * las piezas del combo no traen todas el mismo color.
 */
export function claveColorCombo(lineas: ColoresDeLinea[]): string | null {
  if (lineas.length === 0) return null;
  const claves = new Set(lineas.map(claveDeLinea));
  if (claves.size !== 1) return null;
  return [...claves][0];
}

/** Texto para mostrar la variante: 'Tapizado: Negro · Estructura: Blanca' o el color único. */
export function etiquetaColorCombo(linea: ColoresDeLinea): string {
  return linea.partes.length > 0 ? textoColores(linea.partes) : linea.color.trim();
}

/** La foto de esa clave, solo si coincide exacta; si no, null. */
export function fotoExactaDelColor<T extends { claveColor: string; fotoUrl: string }>(
  fotos: T[],
  clave: string | null,
): T | null {
  if (!clave) return null;
  return fotos.find((foto) => foto.claveColor === clave && foto.fotoUrl) ?? null;
}
