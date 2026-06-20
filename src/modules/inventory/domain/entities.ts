export type InventoryMovementType = "IN" | "OUT" | "ADJUSTMENT";

export type StockStatus = "OK" | "LOW" | "OUT";

export type InventoryMovement = {
  id: string;
  productId: string;
  type: InventoryMovementType;
  change: number;
  note: string | null;
  movementDate: Date;
  createdAt: Date;
};

export type InventoryMovementRow = InventoryMovement & {
  productName: string;
  productCode: string | null;
};

export type ProductStock = {
  productId: string;
  name: string;
  code: string | null;
  minStock: number;
  stock: number;
  status: StockStatus;
  lastMovementAt: Date | null;
};

export type InventoryMetrics = {
  trackedProducts: number;
  totalUnits: number;
  lowStockCount: number;
  outOfStockCount: number;
};
