/**
 * Qué vuelve al inventario al anular o borrar una orden de venta: solo los ítems "por stock"
 * ya confirmados (su salida OUT se registró al confirmar). Los no confirmados y los de
 * fabricación nunca tocaron stock. Devuelve productId → cantidad.
 */
export function stockToRestore(
  items: ReadonlyArray<{ productId: string; quantity: number; fulfillmentMode: string; confirmedAt: Date | null }>,
): Map<string, number> {
  const restore = new Map<string, number>();
  for (const item of items) {
    if (item.fulfillmentMode === "STOCK" && item.confirmedAt !== null) {
      restore.set(item.productId, (restore.get(item.productId) ?? 0) + item.quantity);
    }
  }
  return restore;
}
