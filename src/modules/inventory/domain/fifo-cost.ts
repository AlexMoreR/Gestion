import { roundMoney } from "../../../lib/pricing";

/**
 * Una entrada de inventario de la pieza (movimiento IN), en orden de fecha.
 * `unitCost` = lo que cobró la proveedora por unidad en esa línea (sin el flete del producto);
 * null si la entrada no tiene costo de compra (inventario inicial, ajuste o devolución).
 */
export type FifoStockEntry = {
  quantity: number;
  unitCost: number | null;
  purchaseCode: string | null;
};

export type FifoStockCostInput = {
  /** Entradas de la pieza ordenadas de la más vieja a la más nueva. */
  entries: FifoStockEntry[];
  /** Stock disponible hoy, antes de esta salida. */
  stockOnHand: number;
  /** Unidades que salen. */
  quantityOut: number;
  /** Costo de catálogo por unidad (baseCost + additionalCost). */
  catalogUnitCost: number;
  /** Unidades ya tomadas por otras piezas iguales del mismo lote. */
  alreadyTaken?: number;
};

export type FifoStockCost = {
  unitCost: number;
  /** Ej. "ORD-00092", "ORD-00092 + ORD-00100", "ORD-00092 + catálogo" o "catálogo". */
  source: string;
};

const CATALOG = "catálogo";

/**
 * Costo de las unidades que salen de bodega. Lo que queda en bodega son las unidades MÁS NUEVAS:
 * se arma el bloque del stock actual desde la entrada más nueva hacia atrás, y la salida toma las
 * más viejas de ese bloque (después de las `alreadyTaken`). Lo que no tiene costo de compra, o el
 * stock que no alcanza a explicarse con las entradas, va al costo de catálogo.
 */
export function computeFifoStockCost(input: FifoStockCostInput): FifoStockCost {
  const catalogUnitCost = Math.max(0, input.catalogUnitCost || 0);
  const quantityOut = Math.max(0, Math.floor(input.quantityOut));
  if (quantityOut === 0) {
    return { unitCost: roundMoney(catalogUnitCost), source: CATALOG };
  }

  // Bloque en bodega, de la unidad más vieja a la más nueva.
  const block: Array<{ quantity: number; unitCost: number; label: string }> = [];
  let remaining = Math.max(0, Math.floor(input.stockOnHand));
  for (let i = input.entries.length - 1; i >= 0 && remaining > 0; i -= 1) {
    const entry = input.entries[i];
    const quantity = Math.min(Math.max(0, Math.floor(entry.quantity)), remaining);
    if (quantity === 0) continue;
    remaining -= quantity;
    const hasCost = entry.unitCost !== null && Number.isFinite(entry.unitCost);
    block.unshift({
      quantity,
      unitCost: hasCost ? (entry.unitCost as number) : catalogUnitCost,
      label: hasCost ? (entry.purchaseCode ?? "compra") : CATALOG,
    });
  }
  // Stock que las entradas no explican: es lo más viejo y va a catálogo.
  if (remaining > 0) block.unshift({ quantity: remaining, unitCost: catalogUnitCost, label: CATALOG });

  let skip = Math.max(0, Math.floor(input.alreadyTaken ?? 0));
  let toTake = quantityOut;
  let total = 0;
  const labels: string[] = [];
  const addLabel = (label: string) => {
    if (!labels.includes(label)) labels.push(label);
  };

  for (const chunk of block) {
    if (toTake === 0) break;
    const usable = chunk.quantity - Math.min(skip, chunk.quantity);
    skip = Math.max(0, skip - chunk.quantity);
    if (usable <= 0) continue;
    const taken = Math.min(usable, toTake);
    total += taken * chunk.unitCost;
    toTake -= taken;
    addLabel(chunk.label);
  }
  // Sale más de lo que hay en bodega: lo que falta va a catálogo.
  if (toTake > 0) {
    total += toTake * catalogUnitCost;
    addLabel(CATALOG);
  }

  // "catálogo" siempre al final para que se lea "ORD-00092 + catálogo".
  const ordered = [...labels.filter((l) => l !== CATALOG), ...labels.filter((l) => l === CATALOG)];
  return { unitCost: roundMoney(total / quantityOut), source: ordered.join(" + ") };
}
