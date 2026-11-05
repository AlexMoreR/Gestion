import { faltanColores, POR_DEFINIR, textoColores, type LineaColores, type ParteElegida } from "./product-parts";

export type QuoteItemMeta = {
  description: string;
  color: string;
  additionalCost: number;
  discount: number;
  // Imagen personalizada para la cotizacion. Si esta vacia, se usa la del producto.
  imageUrl: string;
  // Agrupacion de combo: las lineas con el mismo comboKey son componentes del
  // mismo combo y se muestran como una sola fila (con el nombre/codigo del combo).
  // Vacio = producto suelto.
  comboKey: string;
  comboName: string;
  comboCode: string;
  comboQuantity: number;
  // Color escogido de la carta del CRM (nov-2026): copia en texto para que la cotizacion no
  // cambie si despues editan la carta. Vacios = color escrito a mano (o sin color).
  colorCodigo: string;
  colorMaterial: string;
  colorFotoUrl: string;
  // Color por parte (nov-2026): vacio = el producto no tiene partes. Si trae algo, `color` es su
  // texto ("Tapizado: Crema · Base: Dorada") para que todo lo que ya lee `color` siga igual.
  partes: ParteElegida[];
  // Imagen con los colores aplicados (la llena la parte 3).
  imagenColoresUrl: string;
};

const textoParte = (value: unknown): string => (typeof value === "string" ? value : "");

/** Lee las partes guardadas sin fallar con JSON viejo o mal formado; descarta las que no tienen nombre. */
function parsePartes(value: unknown): ParteElegida[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((p) => {
      const raw = (p ?? {}) as Record<string, unknown>;
      return {
        parte: textoParte(raw.parte).trim(),
        color: textoParte(raw.color).trim(),
        colorCodigo: textoParte(raw.colorCodigo).trim(),
        colorMaterial: textoParte(raw.colorMaterial).trim(),
        colorFotoUrl: textoParte(raw.colorFotoUrl).trim(),
        hex: textoParte(raw.hex).trim(),
      };
    })
    .filter((p) => p.parte);
}

const EMPTY_QUOTE_ITEM_META: QuoteItemMeta = {
  description: "",
  color: "",
  additionalCost: 0,
  discount: 0,
  imageUrl: "",
  comboKey: "",
  comboName: "",
  comboCode: "",
  comboQuantity: 0,
  colorCodigo: "",
  colorMaterial: "",
  colorFotoUrl: "",
  partes: [],
  imagenColoresUrl: "",
};

export function parseQuoteItemMeta(value: string | null | undefined): QuoteItemMeta {
  const raw = value?.trim();
  if (!raw) {
    return EMPTY_QUOTE_ITEM_META;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<QuoteItemMeta> & { _type?: string };
    if (parsed?._type === "quote-item-meta") {
      return {
        description: typeof parsed.description === "string" ? parsed.description : "",
        color: typeof parsed.color === "string" ? parsed.color : "",
        additionalCost: typeof parsed.additionalCost === "number" ? parsed.additionalCost : 0,
        discount: typeof parsed.discount === "number" ? parsed.discount : 0,
        imageUrl: typeof parsed.imageUrl === "string" ? parsed.imageUrl : "",
        comboKey: typeof parsed.comboKey === "string" ? parsed.comboKey : "",
        comboName: typeof parsed.comboName === "string" ? parsed.comboName : "",
        comboCode: typeof parsed.comboCode === "string" ? parsed.comboCode : "",
        comboQuantity: typeof parsed.comboQuantity === "number" ? parsed.comboQuantity : 0,
        colorCodigo: typeof parsed.colorCodigo === "string" ? parsed.colorCodigo : "",
        colorMaterial: typeof parsed.colorMaterial === "string" ? parsed.colorMaterial : "",
        colorFotoUrl: typeof parsed.colorFotoUrl === "string" ? parsed.colorFotoUrl : "",
        partes: parsePartes(parsed.partes),
        imagenColoresUrl: typeof parsed.imagenColoresUrl === "string" ? parsed.imagenColoresUrl : "",
      };
    }
  } catch {
    // Legacy plain-text notes.
  }

  return {
    ...EMPTY_QUOTE_ITEM_META,
    description: raw,
  };
}

export function stringifyQuoteItemMeta(meta: Partial<QuoteItemMeta>): string | null {
  const partes = parsePartes(meta.partes);
  const normalized: QuoteItemMeta = {
    description: meta.description?.trim() ?? "",
    color: meta.color?.trim() ?? "",
    additionalCost: Number.isFinite(meta.additionalCost) ? Number(meta.additionalCost) : 0,
    discount: Number.isFinite(meta.discount) ? Number(meta.discount) : 0,
    imageUrl: meta.imageUrl?.trim() ?? "",
    comboKey: meta.comboKey?.trim() ?? "",
    comboName: meta.comboName?.trim() ?? "",
    comboCode: meta.comboCode?.trim() ?? "",
    comboQuantity: Number.isFinite(meta.comboQuantity) ? Number(meta.comboQuantity) : 0,
    colorCodigo: meta.colorCodigo?.trim() ?? "",
    colorMaterial: meta.colorMaterial?.trim() ?? "",
    colorFotoUrl: meta.colorFotoUrl?.trim() ?? "",
    partes,
    imagenColoresUrl: meta.imagenColoresUrl?.trim() ?? "",
  };
  // Con partes, el color es su texto y no hay un color unico de la carta.
  if (partes.length > 0) {
    normalized.color = textoColores(partes);
    normalized.colorCodigo = "";
    normalized.colorMaterial = "";
    normalized.colorFotoUrl = "";
  }

  if (
    !normalized.description &&
    !normalized.color &&
    normalized.additionalCost === 0 &&
    normalized.discount === 0 &&
    !normalized.imageUrl &&
    !normalized.comboKey
  ) {
    return null;
  }

  // Los campos de la carta solo se escriben si traen algo: asi una linea vieja guardada otra vez
  // queda con el mismo texto (mismasLineas compara las notas de una cotizacion con venta).
  const { colorCodigo, colorMaterial, colorFotoUrl, partes: partesGuardadas, imagenColoresUrl, ...rest } = normalized;
  return JSON.stringify({
    _type: "quote-item-meta",
    ...rest,
    ...(colorCodigo ? { colorCodigo } : {}),
    ...(colorMaterial ? { colorMaterial } : {}),
    ...(colorFotoUrl ? { colorFotoUrl } : {}),
    ...(partesGuardadas.length > 0 ? { partes: partesGuardadas } : {}),
    ...(imagenColoresUrl ? { imagenColoresUrl } : {}),
  });
}

/** "CÓDIGO · Nombre (Material)" para un color de la carta; el nombre tal cual si se escribio a mano. */
export function colorLabel(meta: Pick<QuoteItemMeta, "color" | "colorCodigo" | "colorMaterial">): string {
  const nombre = meta.color.trim();
  const codigo = meta.colorCodigo.trim();
  const material = meta.colorMaterial.trim();
  if (!codigo) return nombre;
  return `${codigo} · ${nombre}${material ? ` (${material})` : ""}`;
}

/**
 * Lo que falta escoger antes de guardar la cotización: cada parte sin color (misma regla del paso a
 * venta) y cada combo sin partes ni color. Etiquetas sin repetir ("CMB005 – Tapizado", "CMB005").
 */
export function lineasSinColor(lineas: (LineaColores & { combo: boolean; color: string })[]): string[] {
  const conPartes = lineas.filter((l) => l.requeridas.length > 0);
  const combosSinColor = lineas
    .filter((l) => l.requeridas.length === 0 && l.combo)
    .filter((l) => !l.color.trim() || l.color.trim().toLowerCase() === POR_DEFINIR.toLowerCase())
    .map((l) => l.etiqueta);
  return [...new Set([...faltanColores(conPartes), ...combosSinColor])];
}

export function calculateQuoteLineTotal(
  quantity: number,
  unitPrice: number,
  additionalCost = 0,
  discount = 0,
): number {
  return Number(Math.max(0, quantity * unitPrice + additionalCost - discount).toFixed(2));
}
