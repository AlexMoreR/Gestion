import type { InventoryMetrics, InventoryMovementRow, InventoryMovementType, ProductStock } from "./entities";

export type CreateInventoryMovementInput = {
  productId: string;
  type: InventoryMovementType;
  // Efecto con signo sobre el stock (ya calculado por el caso de uso).
  change: number;
  note?: string | null;
  movementDate: Date;
  createdById: string;
};

export interface InventoryRepository {
  listProductStocks(): Promise<ProductStock[]>;
  getCurrentStock(productId: string): Promise<number>;
  listMovements(): Promise<InventoryMovementRow[]>;
  createMovement(input: CreateInventoryMovementInput): Promise<string>;
  updateMinStock(productId: string, minStock: number): Promise<void>;
  getMetrics(): Promise<InventoryMetrics>;
  // Valida que un producto exista y sea elegible para inventario (tipo STOCK, no combo).
  isTrackableProduct(productId: string): Promise<boolean>;
}
