export type InventoryMovementType = "IN" | "OUT" | "ADJUSTMENT";

export type StockStatus = "OK" | "LOW" | "OUT";

export type InventoryMovement = {
  id: string;
  productId: string;
  type: InventoryMovementType;
  change: number;
  note: string | null;
  purchaseCode: string | null;
  movementDate: Date;
  createdAt: Date;
};

export type InventoryMovementRow = InventoryMovement & {
  productName: string;
  productCode: string | null;
  // Código de la orden (ORD-...) asociada al código de compra (COM-...), si existe.
  orderCode: string | null;
};

export type ProductStock = {
  productId: string;
  name: string;
  code: string | null;
  categoryName: string | null;
  price: number;
  baseCost: number;
  thumbnailUrl: string;
  minStock: number;
  stock: number;
  status: StockStatus;
  lastMovementAt: Date | null;
};

export type InventoryMetrics = {
  trackedProducts: number;
  inStockProducts: number;
  totalUnits: number;
  lowStockCount: number;
  outOfStockCount: number;
  // Valor total del inventario a costo (suma de stock x costo de compra).
  totalValue: number;
};
