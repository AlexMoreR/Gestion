// Costo unitario de compra de un item de una orden, usado para calcular la
// ganancia ("valor ganado") de forma consistente en toda la app.
//
// Prioridad:
//  1. Costo confirmado del item (purchaseCost) — cuando se confirmo con proveedor.
//  2. STOCK: costo real de inventario = costo base + envio/flete del producto
//     (el "Costo de compra" del producto, que SI incluye el flete).
//  3. Fabricacion sin confirmar: costo del proveedor preferido o, si falta, el base.
export function computeItemUnitCost(params: {
  purchaseCost: number | null;
  fulfillmentMode: string;
  baseCost: number;
  additionalCost: number;
  preferredSupplierCost?: number | null;
}): number {
  if (params.purchaseCost != null) {
    return params.purchaseCost;
  }
  if (params.fulfillmentMode === "STOCK") {
    return params.baseCost + params.additionalCost;
  }
  return params.preferredSupplierCost ?? params.baseCost;
}
