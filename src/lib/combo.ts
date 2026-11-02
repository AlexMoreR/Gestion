// Utilidades para "combos" (productos compuestos).
//
// Un combo es un producto marcado con isBundle=true que se arma con otros
// productos reales (sus componentes). El combo NO se vende como tal: al
// agregarlo a una venta o cotizacion se "expande" en una linea por cada
// componente, de modo que cada uno conserva su propio proveedor, su
// fabricacion y su pago, sin tocar el resto del flujo.

export type ComboComponent = {
  productId: string;
  name: string;
  code: string | null;
  quantity: number; // unidades del componente por cada combo
  retailPrice: number; // precio individual del componente (peso para repartir)
  thumbnailUrl?: string | null;
  stock?: number; // existencias de la pieza (para escoger la alterna)
  alternates?: ComboAlternate[]; // piezas que pueden ir en su lugar (misma cantidad)
};

export type ComboAlternate = Omit<ComboComponent, "quantity" | "alternates">;

/**
 * Cuantos combos se pueden armar: minimo, por pieza, de (stock de la pieza +
 * stock de sus alternas) / unidades requeridas. Sin piezas validas = 0.
 */
export function comboStock(
  components: { childId: string; quantity: number; alternates?: { productId: string }[] }[],
  stockOf: (productId: string) => number,
): number {
  const valid = components.filter((component) => component.quantity > 0);
  if (valid.length === 0) return 0;
  const buildable = Math.min(
    ...valid.map((component) => {
      const ids = [component.childId, ...(component.alternates ?? []).map((alt) => alt.productId)];
      const total = ids.reduce((sum, id) => sum + Math.max(0, stockOf(id)), 0);
      return Math.floor(total / component.quantity);
    }),
  );
  return Math.max(0, buildable);
}

/**
 * Al vender "por stock": cambia cada pieza por la primera (principal, luego
 * alternas) que tenga existencias para toda la cantidad de combos. Si ninguna
 * alcanza, se queda la principal.
 * shortcut: no mezcla principal + alterna en una pieza (ej. 1 BMV016 + 1 BMV003
 * para 2 combos); si hace falta, partir la linea por pieza.
 */
export function pickComboPieces(components: ComboComponent[], comboQuantity: number): ComboComponent[] {
  return components.map((component) => {
    const needed = component.quantity * comboQuantity;
    if ((component.stock ?? 0) >= needed) return component;
    const alternate = (component.alternates ?? []).find((alt) => (alt.stock ?? 0) >= needed);
    return alternate ? { ...component, ...alternate } : component;
  });
}

export type ExpandedComboLine = {
  productId: string;
  name: string;
  code: string | null;
  quantity: number; // quantity del componente * cantidad de combos
  unitPrice: number; // precio unitario repartido del combo
};

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Reparte el precio total del combo (comboUnitPrice * comboQuantity) entre sus
 * componentes en proporcion al precio individual de cada uno, y devuelve una
 * linea por componente lista para agregar a la venta/cotizacion.
 *
 * El ultimo componente absorbe el redondeo para que la suma de las lineas
 * coincida con el total del combo.
 */
export function expandComboLines(
  components: ComboComponent[],
  comboQuantity: number,
  comboUnitPrice: number,
): ExpandedComboLine[] {
  const validComponents = components.filter((component) => component.quantity > 0);
  if (validComponents.length === 0) {
    return [];
  }

  const comboTotal = round2(comboUnitPrice * comboQuantity);
  const weights = validComponents.map((component) => Math.max(0, component.retailPrice) * component.quantity);
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);

  let allocated = 0;

  return validComponents.map((component, index) => {
    const lineQuantity = component.quantity * comboQuantity;

    let amount: number;
    if (index === validComponents.length - 1) {
      amount = round2(comboTotal - allocated);
    } else {
      const share = weightSum > 0 ? weights[index] / weightSum : 1 / validComponents.length;
      amount = round2(comboTotal * share);
      allocated = round2(allocated + amount);
    }

    const unitPrice = lineQuantity > 0 ? round2(amount / lineQuantity) : 0;

    return {
      productId: component.productId,
      name: component.name,
      code: component.code,
      quantity: lineQuantity,
      unitPrice,
    };
  });
}

// --- Combos sin piezas (31-oct-2026): que el sistema no deje equivocar a quien carga el catalogo ---

export const COMBO_SIN_PIEZAS_MENSAJE = "Este producto es un combo: agrega sus piezas antes de guardar.";

/** Parece combo si el codigo empieza por "CMB" o el nombre tiene la palabra "combo" o "kit". */
export function pareceCombo(code: string | null | undefined, name: string | null | undefined): boolean {
  if ((code ?? "").trim().toUpperCase().startsWith("CMB")) return true;
  // \p{L} en vez de \b: asi "KITCHEN" no cuenta y las letras con tilde se respetan.
  return /(?<!\p{L})(combo|kit)(?!\p{L})/iu.test(name ?? "");
}

/** Un producto que parece combo debe estar marcado como combo y sumar al menos 2 unidades entre sus piezas. */
export function faltanPiezasCombo(product: {
  code: string | null | undefined;
  name: string | null | undefined;
  isBundle: boolean;
  components: { quantity: number }[];
}): boolean {
  if (!pareceCombo(product.code, product.name)) return false;
  const unidades = product.components.reduce((sum, component) => sum + Math.max(0, component.quantity), 0);
  return !product.isBundle || unidades < 2;
}
