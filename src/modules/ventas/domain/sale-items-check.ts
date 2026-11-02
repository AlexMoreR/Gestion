// Regla pura (oct-2026): una venta debe llevar productos del catálogo con costo cargado; si un producto
// tiene costo 0, la ganancia de la venta sale inflada en Balances y en comisiones. Sin Prisma.

export type SaleItemForCheck = {
  quantity: number;
  baseCost: number;
  additionalCost: number;
  productName: string;
};

export type SaleItemsCheck =
  | { ok: true }
  | { ok: false; reason: "sin_productos" }
  | { ok: false; reason: "sin_costo"; productNames: string[] };

export const SALE_WITHOUT_PRODUCTS_ERROR = "La venta debe tener al menos un producto del catálogo";

export function checkSaleItems(items: readonly SaleItemForCheck[]): SaleItemsCheck {
  const withQuantity = items.filter((item) => item.quantity > 0);
  if (withQuantity.length === 0) return { ok: false, reason: "sin_productos" };

  const productNames = Array.from(
    new Set(
      withQuantity
        .filter((item) => !(Number(item.baseCost) + Number(item.additionalCost) > 0))
        .map((item) => item.productName),
    ),
  );
  return productNames.length > 0 ? { ok: false, reason: "sin_costo", productNames } : { ok: true };
}

/** Mensaje para el formulario, o null si la venta puede guardarse. */
export function saleItemsErrorMessage(items: readonly SaleItemForCheck[]): string | null {
  const check = checkSaleItems(items);
  if (check.ok) return null;
  if (check.reason === "sin_productos") return SALE_WITHOUT_PRODUCTS_ERROR;
  const [first] = check.productNames;
  if (check.productNames.length === 1) {
    return `El producto ${first} no tiene costo. Cárgale el costo en /admin/productos antes de crear la venta`;
  }
  return `Estos productos no tienen costo: ${check.productNames.join(", ")}. Cárgales el costo en /admin/productos antes de crear la venta`;
}
