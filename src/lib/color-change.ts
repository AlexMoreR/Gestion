// Cambio de color en una venta activa (nov-2026): el color vive como texto en las notas de cada
// línea (QuoteItem y, copiado, OrderItem). Aquí solo reglas puras: validar, reescribir la nota sin
// tocar lo demás y escoger qué líneas cambian. La escritura está en adminChangeSaleItemColorAction.
import { displayCode } from "./code-display";
import { colombiaDayKey } from "./colombia-time";
import { parseQuoteItemMeta, stringifyQuoteItemMeta } from "./quote-item-meta";

export const COLOR_CHANGE_REASON_MIN = 3;
export const COLOR_CHANGE_REASON_MAX = 300;

export type NuevoColor = { color: string; colorCodigo: string; colorMaterial: string; colorFotoUrl: string };

type Resultado<T> = { ok: true; value: T } | { ok: false; error: string };

const texto = (value: unknown, max: number): string =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

export function parseColorChangeReason(raw: unknown): Resultado<string> {
  const motivo = typeof raw === "string" ? raw.trim() : "";
  if (motivo.length < COLOR_CHANGE_REASON_MIN) {
    return { ok: false, error: `Escribe el motivo del cambio (mínimo ${COLOR_CHANGE_REASON_MIN} letras).` };
  }
  if (motivo.length > COLOR_CHANGE_REASON_MAX) {
    return { ok: false, error: `El motivo no puede pasar de ${COLOR_CHANGE_REASON_MAX} letras.` };
  }
  return { ok: true, value: motivo };
}

/** Color que llega del formulario: nombre obligatorio; código, material y foto (http/https) opcionales. */
export function parseNuevoColor(input: Record<string, unknown>): Resultado<NuevoColor> {
  const color = texto(input.color, 80);
  if (!color) return { ok: false, error: "Escoge o escribe el color nuevo." };
  const foto = texto(input.colorFotoUrl, 1000);
  let colorFotoUrl = "";
  if (foto) {
    try {
      const url = new URL(foto);
      if (url.protocol === "http:" || url.protocol === "https:") colorFotoUrl = url.toString();
    } catch {
      // Foto inválida: se guarda el color sin foto.
    }
  }
  const colorCodigo = texto(input.colorCodigo, 40);
  return {
    ok: true,
    // Sin código es un color escrito a mano: no lleva material ni foto de la carta.
    value: {
      color,
      colorCodigo,
      colorMaterial: colorCodigo ? texto(input.colorMaterial, 80) : "",
      colorFotoUrl: colorCodigo ? colorFotoUrl : "",
    },
  };
}

/** La misma nota con solo el color cambiado (descripción, descuento, costo adicional y combo quedan igual). */
export function notesWithNewColor(notes: string | null, nuevo: NuevoColor): string | null {
  // Sin partes: el color nuevo es un solo texto (con partes, stringify lo pisaría con el de las partes).
  return stringifyQuoteItemMeta({ ...parseQuoteItemMeta(notes), ...nuevo, partes: [] });
}

export function mismoColor(notes: string | null, nuevo: NuevoColor): boolean {
  const meta = parseQuoteItemMeta(notes);
  return (
    meta.color.trim() === nuevo.color &&
    meta.colorCodigo.trim() === nuevo.colorCodigo &&
    meta.colorMaterial.trim() === nuevo.colorMaterial
  );
}

export type LineaCotizacion = { id: string; notes: string | null; productName: string; isBundle: boolean };
export type LineaOrden = { id: string; quoteItemId: string | null; notes: string | null };

// Etiqueta que order-items.ts le pone a cada pieza de un combo sin desglosar.
const comboLabel = (q: LineaCotizacion) => `Combo: ${q.productName}`;
const esPiezaDe = (o: LineaOrden, q: LineaCotizacion) => {
  const descripcion = parseQuoteItemMeta(o.notes).description;
  return descripcion === comboLabel(q) || descripcion.endsWith(` - ${comboLabel(q)}`);
};
const colorDe = (notes: string | null) => parseQuoteItemMeta(notes).color.trim();

/**
 * Qué líneas cambian al cambiar el color del producto `orderItemId`:
 * - su línea de la cotización y, si es parte de un combo desglosado (comboKey), todas las del combo;
 * - en la orden, las ligadas a esas líneas y las piezas de un combo sin desglosar ("Combo: <nombre>").
 * Si hay dos combos sin desglosar del mismo producto, se separan por el color que tenían.
 */
export function linesToRecolor(
  orderItemId: string,
  quoteItems: LineaCotizacion[],
  orderItems: LineaOrden[],
): { quoteItemIds: string[]; orderItemIds: string[] } | null {
  const clicked = orderItems.find((o) => o.id === orderItemId);
  if (!clicked) return null;

  let source = clicked.quoteItemId ? quoteItems.find((q) => q.id === clicked.quoteItemId) : undefined;
  if (!source && !clicked.quoteItemId) {
    const combos = quoteItems.filter((q) => q.isBundle && esPiezaDe(clicked, q));
    source = combos.length === 1 ? combos[0] : combos.find((q) => colorDe(q.notes) === colorDe(clicked.notes));
  }
  if (!source) return { quoteItemIds: [], orderItemIds: [clicked.id] };

  const comboKey = parseQuoteItemMeta(source.notes).comboKey;
  const grupo = comboKey ? quoteItems.filter((q) => parseQuoteItemMeta(q.notes).comboKey === comboKey) : [source];
  const ids = new Set(grupo.map((q) => q.id));

  const orderIds = new Set<string>([clicked.id]);
  for (const o of orderItems) {
    if (o.quoteItemId && ids.has(o.quoteItemId)) orderIds.add(o.id);
  }
  for (const q of grupo.filter((g) => g.isBundle)) {
    const gemelos = quoteItems.filter((x) => x.isBundle && x.productName === q.productName).length;
    for (const o of orderItems) {
      if (o.quoteItemId || !esPiezaDe(o, q)) continue;
      if (gemelos > 1 && colorDe(o.notes) !== colorDe(q.notes)) continue;
      orderIds.add(o.id);
    }
  }
  return { quoteItemIds: [...ids], orderItemIds: [...orderIds] };
}

// ── Aviso a la proveedora (nov-2026) ──────────────────────────────────────────────────────────────
// Un aviso por OF y por cambio: la OF es de una proveedora en una orden, y cuenta si alguna de las
// líneas recoloreadas es suya y no sale de stock (las de stock no están en su OF).
export type LineaRecoloreada = { confirmedSupplierId: string | null; fulfillmentMode: string };
export type OFDeLaOrden = { id: string; supplierId: string };

export function ofsConCambioDeColor(lineas: LineaRecoloreada[], ofs: OFDeLaOrden[]): string[] {
  const proveedoras = new Set(
    lineas.filter((l) => l.confirmedSupplierId && l.fulfillmentMode !== "STOCK").map((l) => l.confirmedSupplierId),
  );
  return ofs.filter((of) => proveedoras.has(of.supplierId)).map((of) => of.id);
}

export function mensajeCambioColorOF(aviso: {
  code: string;
  producto: string;
  colorViejo: string;
  colorNuevo: string;
  url: string;
}): string {
  return `Cambio de color en ${displayCode(aviso.code)}: ${aviso.producto} pasa de ${aviso.colorViejo} a ${aviso.colorNuevo}\n${aviso.url}`;
}

/** Fecha del aviso para mostrar (día en Colombia), p. ej. "04/11/2026". */
export function fechaAviso(date: Date): string {
  const [y, m, d] = colombiaDayKey(date).split("-");
  return `${d}/${m}/${y}`;
}
