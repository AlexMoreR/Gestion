// Reglas puras para entregar una orden por partes: separar unidades de una línea
// y decidir si la orden ya está totalmente entregada.

export type SplitResult = {
  /** Lo que queda en la línea original. */
  keep: { quantity: number; lineTotal: number };
  /** Lo que pasa a la línea nueva. */
  moved: { quantity: number; lineTotal: number };
};

/**
 * Reparte cantidad y valor de una línea. La parte separada vale unitPrice × cantidad
 * y la original se queda con el resto, así la suma nunca pierde ni gana pesos.
 * Devuelve null si la cantidad a separar no está entre 1 y (cantidad − 1).
 */
export function splitOrderItemQuantities(
  quantity: number,
  lineTotal: number,
  unitPrice: number,
  splitQty: number,
): SplitResult | null {
  if (!Number.isInteger(quantity) || !Number.isInteger(splitQty)) return null;
  if (splitQty < 1 || splitQty > quantity - 1) return null;

  const movedTotal = Math.round(unitPrice * splitQty * 100) / 100;
  return {
    keep: { quantity: quantity - splitQty, lineTotal: Math.round((lineTotal - movedTotal) * 100) / 100 },
    moved: { quantity: splitQty, lineTotal: movedTotal },
  };
}

type DeliveryItem = {
  quantity: number;
  dispatchItems: { quantity: number; dispatch: { status: string } }[];
};

/** La orden está entregada cuando cada unidad de cada línea está en un despacho entregado. */
export function isOrderFullyDelivered(items: DeliveryItem[]): boolean {
  return items.every((item) => {
    const delivered = item.dispatchItems
      .filter((d) => d.dispatch.status === "DELIVERED")
      .reduce((sum, d) => sum + d.quantity, 0);
    return delivered >= item.quantity;
  });
}
