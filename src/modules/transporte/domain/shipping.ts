// Reglas puras de envio (sin Prisma): normalizar nombres y decidir el tipo de envio y el total.

export type ShippingTypeName = "GRATIS" | "ADICIONAL" | "COTIZAR" | "NO_LLEGA";

// Nombre sin acentos, en minusculas y con espacios simples. Debe dar lo mismo que el SQL
// de la migracion 20261006230000 (translate + lower + btrim + regexp_replace).
export function normalizePlaceName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// Tipo efectivo de una ubicacion. Un corregimiento sin tipo propio hereda el de su ciudad; si
// nadie tiene tipo, se usa el freeShipping de siempre (true -> GRATIS, false -> COTIZAR).
export function resolveShippingType(place: {
  shippingType: ShippingTypeName | null;
  freeShipping: boolean;
  parent?: { shippingType: ShippingTypeName | null; freeShipping: boolean } | null;
}): ShippingTypeName {
  if (place.shippingType) {
    return place.shippingType;
  }
  if (place.parent?.shippingType) {
    return place.parent.shippingType;
  }
  if (place.freeShipping || place.parent?.freeShipping) {
    return "GRATIS";
  }
  return "COTIZAR";
}

// Valor del envio ADICIONAL de un producto: el del producto, si no el de su categoria.
export function resolveProductShippingExtra(product: {
  shippingExtra: number | null;
  categoryShippingExtra: number | null;
}): number | null {
  return product.shippingExtra ?? product.categoryShippingExtra ?? null;
}

// Lee el campo "Envio adicional (COP)" de un formulario. Acepta "100000", "100.000" o "$ 100.000".
// Vacio -> null (se cotiza). Devuelve undefined si el valor no es valido (letras, decimales, negativo
// o mas de 10 millones).
export const MAX_SHIPPING_EXTRA = 10_000_000;
export function parseShippingExtraInput(raw: unknown): number | null | undefined {
  if (raw == null) {
    return null;
  }
  if (typeof raw !== "string") {
    return undefined;
  }
  const text = raw.replace(/[\s$]/g, "").replace(/COP/i, "");
  if (text === "") {
    return null;
  }
  if (!/^\d{1,3}(\.\d{3})*$|^\d+$/.test(text)) {
    return undefined;
  }
  const value = Number(text.replace(/\./g, ""));
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_SHIPPING_EXTRA) {
    return undefined;
  }
  return value;
}

export type ShippingQuote = {
  tipo: ShippingTypeName;
  envio: number | null; // valor del envio (0 si es gratis, null si se cotiza o no llega)
  total: number | null; // precio + envio, un solo total (null si se cotiza o no llega)
};

// Total para un producto en una ubicacion. Si la ubicacion es ADICIONAL pero el producto no
// tiene valor de envio cargado, se trata como COTIZAR (nunca se inventa un valor).
export function quoteShipping(params: {
  tipo: ShippingTypeName;
  price: number | null;
  shippingExtra: number | null;
}): ShippingQuote {
  const { tipo, price, shippingExtra } = params;
  if (tipo === "GRATIS") {
    return { tipo, envio: 0, total: price };
  }
  if (tipo === "ADICIONAL") {
    if (shippingExtra == null) {
      return { tipo: "COTIZAR", envio: null, total: null };
    }
    return { tipo, envio: shippingExtra, total: price == null ? null : price + shippingExtra };
  }
  return { tipo, envio: null, total: null };
}
