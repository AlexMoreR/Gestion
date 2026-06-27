import type { InventoryMetrics, ProductStock, StockStatus } from "./entities";

export function computeStockStatus(stock: number, minStock: number): StockStatus {
  if (stock <= 0) {
    return "OUT";
  }
  if (minStock > 0 && stock <= minStock) {
    return "LOW";
  }
  return "OK";
}

export function summarizeInventoryMetrics(stocks: ProductStock[]): InventoryMetrics {
  const trackedProducts = stocks.length;
  const inStockProducts = stocks.filter((item) => item.stock > 0).length;
  const totalUnits = stocks.reduce((sum, item) => sum + Math.max(0, item.stock), 0);
  const lowStockCount = stocks.filter((item) => item.status === "LOW").length;
  const outOfStockCount = stocks.filter((item) => item.status === "OUT").length;
  // Valor del inventario = stock x costo total (proveedor + flete/adicional).
  const totalValue = stocks.reduce(
    (sum, item) => sum + Math.max(0, item.stock) * (item.baseCost + item.additionalCost),
    0,
  );

  return {
    trackedProducts,
    inStockProducts,
    totalUnits,
    lowStockCount,
    outOfStockCount,
    totalValue,
  };
}
