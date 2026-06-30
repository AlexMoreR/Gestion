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
};

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
  };

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

  return JSON.stringify({
    _type: "quote-item-meta",
    ...normalized,
  });
}

export function calculateQuoteLineTotal(
  quantity: number,
  unitPrice: number,
  additionalCost = 0,
  discount = 0,
): number {
  return Number(Math.max(0, quantity * unitPrice + additionalCost - discount).toFixed(2));
}
