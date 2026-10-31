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
  stock?: number; // existencias de la pieza (para escoger la que hay al vender por stock)
  alternates?: ComboComponent[]; // piezas que pueden ir en su lugar (misma cantidad por combo)
};

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

type StockComponent = { childId: string; quantity: number; alternates?: { productId: string }[] };

/**
 * Cuantos combos se pueden armar: minimo, por pieza, de (stock de la pieza
 * principal + sus alternas) / unidades requeridas. Sin piezas validas, 0.
 */
export function comboStock(components: StockComponent[], stockOf: (productId: string) => number): number {
  const valid = components.filter((component) => component.quantity > 0);
  if (valid.length === 0) return 0;
  const buildable = Math.min(
    ...valid.map((component) => {
      const ids = [component.childId, ...(component.alternates ?? []).map((alternate) => alternate.productId)];
      const available = ids.reduce((sum, id) => sum + Math.max(0, stockOf(id)), 0);
      return Math.floor(available / component.quantity);
    }),
  );
  return Math.max(0, buildable);
}

/**
 * Antes de partir un combo vendido "por stock": cambia cada pieza por la
 * primera que tenga existencias para toda la cantidad (primero la principal,
 * luego las alternas). Si ninguna alcanza, deja la principal.
 * shortcut: no mezcla principal y alterna en una misma linea (ej. 1 BMV016 + 1 BMV003); si hiciera falta, partir la linea.
 */
export function pickComboPieces(components: ComboComponent[], comboQuantity: number): ComboComponent[] {
  return components.map((component) => {
    const needed = component.quantity * comboQuantity;
    if ((component.stock ?? 0) >= needed) return component;
    const alternate = (component.alternates ?? []).find((option) => (option.stock ?? 0) >= needed);
    return alternate ? { ...alternate, quantity: component.quantity } : component;
  });
}
