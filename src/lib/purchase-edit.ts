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
// subtotal (envío y otros costos adicionales), que el formulario de edición no trae.
export function purchaseEditTotals(
  previous: { subtotal: number; total: number },
  newSubtotal: number,
): { subtotal: number; total: number } {
  const extras = Math.max(0, previous.total - previous.subtotal);
  return { subtotal: newSubtotal, total: newSubtotal + extras };
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
