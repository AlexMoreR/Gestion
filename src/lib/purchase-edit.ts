// Regla pura para EDITAR una compra sin borrarla: decide qué líneas de la orden
// se actualizan, cuáles se crean y cuáles se quitan (y cuáles no se pueden quitar).

export type ExistingPurchaseItem = {
  id: string;
  productId: string;
  name: string;
  quantity: number;
  cost: number; // costo unitario guardado (purchaseCost ?? unitPrice)
  supplierId: string | null;
  dispatched: boolean; // tiene despacho (DispatchItem)
  hasPayments: boolean; // algún pago a la proveedora apunta a esta línea o a su cargo
};

export type SubmittedPurchaseLine = {
  orderItemId: string;
  productId: string;
  quantity: number;
  cost: number;
  supplierId: string;
};

export type PurchaseEditPlan<L extends SubmittedPurchaseLine> = {
  keep: Array<{ item: ExistingPurchaseItem; line: L; changed: boolean }>;
  create: L[];
  remove: ExistingPurchaseItem[];
  error: string | null;
};

export function planPurchaseEdit<L extends SubmittedPurchaseLine>(
  existing: ExistingPurchaseItem[],
  submitted: L[],
): PurchaseEditPlan<L> {
  const byId = new Map(existing.map((item) => [item.id, item]));
  const used = new Set<string>();
  const keep: PurchaseEditPlan<L>["keep"] = [];
  const create: L[] = [];
  let error: string | null = null;

  for (const line of submitted) {
    const item = byId.get(line.orderItemId);
    // Solo es la misma línea si es del mismo producto y no se repite.
    if (!item || used.has(item.id) || item.productId !== line.productId) {
      create.push(line);
      continue;
    }
    used.add(item.id);
    const changed =
      line.quantity !== item.quantity ||
      line.cost !== item.cost ||
      (line.supplierId || null) !== (item.supplierId || null);
    if (changed && item.hasPayments && (line.supplierId || null) !== (item.supplierId || null)) {
      error ??= `${item.name} tiene pagos: no se puede cambiar la proveedora.`;
    }
    keep.push({ item, line, changed });
  }

  const remove = existing.filter((item) => !used.has(item.id));
  for (const item of remove) {
    if (item.dispatched) error ??= `${item.name} ya tiene despacho: no se puede quitar de la compra.`;
    else if (item.hasPayments) error ??= `${item.name} tiene pagos: no se puede quitar de la compra.`;
  }

  return { keep, create, remove, error };
}

// Nuevo subtotal/total de la orden: el total conserva lo que ya tenía encima del
// subtotal (envío, costos adicionales y descuentos/recargos previos, que pueden dejarlo
// negativo) y suma el ajuste nuevo de esta edición (negativo = descuento).
export function purchaseEditTotals(
  previous: { subtotal: number; total: number },
  newSubtotal: number,
  adjustment = 0,
): { subtotal: number; total: number } {
  const extras = previous.total - previous.subtotal;
  return { subtotal: newSubtotal, total: newSubtotal + extras + adjustment };
}

export const MIN_PURCHASE_EDIT_REASON = 3;

// Motivo de la edición: obligatorio (mínimo 3 letras).
export function purchaseEditReasonError(reason: string): string | null {
  return reason.trim().length >= MIN_PURCHASE_EDIT_REASON
    ? null
    : "Escribe el motivo del cambio (mínimo 3 letras).";
}

export type PurchaseAdjustmentInput = { kind: string; amount: number; supplierId: string };
export type PurchaseAdjustment = { amount: number; note: string; supplierId: string };

// Descuento o recargo sobre el total de la compra: un cargo a la proveedora sin
// producto, negativo si es descuento. Monto vacío o 0 = sin ajuste.
export function parsePurchaseAdjustment(
  input: PurchaseAdjustmentInput | null,
  reason: string,
): { adjustment: PurchaseAdjustment | null; error: string | null } {
  if (!input || !(input.amount > 0)) {
    if (input && input.amount < 0) return { adjustment: null, error: "El monto del ajuste debe ser mayor que 0." };
    return { adjustment: null, error: null };
  }
  if (input.kind !== "DESCUENTO" && input.kind !== "RECARGO") {
    return { adjustment: null, error: "Elige si es Descuento o Recargo." };
  }
  if (!Number.isFinite(input.amount)) return { adjustment: null, error: "Monto del ajuste inválido." };
  if (!input.supplierId) return { adjustment: null, error: "Elige la proveedora del ajuste." };
  const reasonError = purchaseEditReasonError(reason);
  if (reasonError) return { adjustment: null, error: reasonError };
  const amount = Math.round(input.amount * 100) / 100;
  const isDiscount = input.kind === "DESCUENTO";
  return {
    adjustment: {
      amount: isDiscount ? -amount : amount,
      note: `${isDiscount ? "Descuento" : "Recargo"}: ${reason.trim()}`,
      supplierId: input.supplierId,
    },
    error: null,
  };
}

// Cuánto cambia el stock de cada producto: unidades nuevas de la compra menos las
// que ya sumaban sus entradas. Solo devuelve los productos que cambian.
export function purchaseStockDeltas(
  currentUnits: Map<string, number>,
  newUnits: Map<string, number>,
): Map<string, number> {
  const deltas = new Map<string, number>();
  for (const productId of new Set([...currentUnits.keys(), ...newUnits.keys()])) {
    const delta = (newUnits.get(productId) ?? 0) - (currentUnits.get(productId) ?? 0);
    if (delta !== 0) deltas.set(productId, delta);
  }
  return deltas;
}
