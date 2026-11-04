// Cambio de color en una venta activa (nov-2026): el color vive como texto en las notas de cada
// línea (QuoteItem y, copiado, OrderItem). Aquí solo reglas puras: validar, reescribir la nota sin
// tocar lo demás y escoger qué líneas cambian. La escritura está en adminChangeSaleItemColorAction.
import { parseQuoteItemMeta, stringifyQuoteItemMeta } from "./quote-item-meta";
import { POR_DEFINIR, textoColores, type ParteElegida } from "./product-parts";

export const COLOR_CHANGE_REASON_MIN = 3;
export const COLOR_CHANGE_REASON_MAX = 300;

export type NuevoColor = {
  color: string;
  colorCodigo: string;
  colorMaterial: string;
  colorFotoUrl: string;
  /** Color por parte: solo las partes que cambian (por nombre). Vacío/ausente = un solo color de texto. */
  partes?: ParteElegida[];
};

const MAX_PARTES = 10;
const clave = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

const fotoHttp = (valor: string): string => {
  try {
    const url = new URL(valor);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
};

/** Partes que llegan del formulario (JSON). null = mal formadas. */
function parsePartesNuevas(raw: unknown): ParteElegida[] | null {
  if (raw == null || raw === "") return [];
  let lista: unknown = raw;
  if (typeof raw === "string") {
    try {
      lista = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(lista) || lista.length > MAX_PARTES) return null;
  const partes = lista.map((p) => {
    const r = (p ?? {}) as Record<string, unknown>;
    const hex = texto(r.hex, 7);
    const color = texto(r.color, 80);
    return {
      parte: texto(r.parte, 40),
      color: clave(color) === clave(POR_DEFINIR) ? "" : color,
      colorCodigo: texto(r.colorCodigo, 40),
      colorMaterial: texto(r.colorMaterial, 80),
      colorFotoUrl: fotoHttp(texto(r.colorFotoUrl, 1000)),
      hex: /^#[0-9a-f]{6}$/i.test(hex) ? hex : "",
    };
  });
  return partes.every((p) => p.parte) ? partes : null;
}

/** Las partes de la línea con las que cambian (mismo nombre, sin importar tildes); una línea sin partes toma las nuevas. */
export function partesCambiadas(actuales: ParteElegida[], nuevas: ParteElegida[]): ParteElegida[] {
  if (actuales.length === 0) return nuevas;
  return actuales.map((parte) => nuevas.find((n) => clave(n.parte) === clave(parte.parte)) ?? parte);
}

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
  const partes = parsePartesNuevas(input.partes);
  if (partes === null) return { ok: false, error: "Los colores por parte no son válidos." };
  if (partes.length > 0) {
    if (!partes.some((p) => p.color)) return { ok: false, error: "Escoge el color de al menos una parte." };
    return { ok: true, value: { color: textoColores(partes), colorCodigo: "", colorMaterial: "", colorFotoUrl: "", partes } };
  }
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

/**
 * La misma nota con solo el color cambiado (descripción, descuento, costo adicional y combo quedan igual).
 * Con partes cambia solo las del mismo nombre y guarda la imagen nueva (`imagenColoresUrl`, "" = sin vista previa).
 */
export function notesWithNewColor(notes: string | null, nuevo: NuevoColor, imagenColoresUrl = ""): string | null {
  const meta = parseQuoteItemMeta(notes);
  if (nuevo.partes && nuevo.partes.length > 0) {
    return stringifyQuoteItemMeta({ ...meta, partes: partesCambiadas(meta.partes, nuevo.partes), imagenColoresUrl });
  }
  // Sin partes: el color nuevo es un solo texto (con partes, stringify lo pisaría con el de las partes) y la
  // imagen con los colores viejos ya no vale.
  const { partes: _sinPartes, ...soloColor } = nuevo;
  void _sinPartes;
  return stringifyQuoteItemMeta({ ...meta, ...soloColor, partes: [], imagenColoresUrl: "" });
}

const partesIguales = (a: ParteElegida[], b: ParteElegida[]) =>
  a.length === b.length &&
  a.every(
    (p, i) => p.parte === b[i].parte && p.color === b[i].color && p.colorCodigo === b[i].colorCodigo && p.colorMaterial === b[i].colorMaterial,
  );

export function mismoColor(notes: string | null, nuevo: NuevoColor): boolean {
  const meta = parseQuoteItemMeta(notes);
  if (nuevo.partes && nuevo.partes.length > 0) {
    return meta.partes.length > 0 && partesIguales(meta.partes, partesCambiadas(meta.partes, nuevo.partes));
  }
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
