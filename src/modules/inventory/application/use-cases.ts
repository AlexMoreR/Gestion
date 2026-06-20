import type { InventoryMovementType } from "../domain/entities";
import type { InventoryRepository } from "../domain/repository";

export type InventoryErrorCode =
  | "PRODUCT_NOT_TRACKABLE"
  | "INVALID_QUANTITY"
  | "INSUFFICIENT_STOCK"
  | "NO_CHANGE";

export class InventoryError extends Error {
  code: InventoryErrorCode;
  constructor(code: InventoryErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "InventoryError";
  }
}

export type RegisterMovementInput = {
  productId: string;
  type: InventoryMovementType;
  quantity: number;
  note?: string | null;
  movementDate: Date;
  createdById: string;
};

/**
 * Registra un movimiento de inventario calculando su efecto con signo sobre el
 * stock. IN suma, OUT resta (sin dejar el stock negativo) y ADJUSTMENT fija el
 * conteo real (la diferencia contra el stock actual se guarda como el cambio).
 */
export async function registerInventoryMovementUseCase(
  repository: InventoryRepository,
  input: RegisterMovementInput,
): Promise<string> {
  const trackable = await repository.isTrackableProduct(input.productId);
  if (!trackable) {
    throw new InventoryError(
      "PRODUCT_NOT_TRACKABLE",
      "El producto no maneja inventario (debe ser tipo Stock y no un combo).",
    );
  }

  const currentStock = await repository.getCurrentStock(input.productId);
  let change: number;

  if (input.type === "IN") {
    if (input.quantity <= 0) {
      throw new InventoryError("INVALID_QUANTITY", "La cantidad de entrada debe ser mayor a cero.");
    }
    change = input.quantity;
  } else if (input.type === "OUT") {
    if (input.quantity <= 0) {
      throw new InventoryError("INVALID_QUANTITY", "La cantidad de salida debe ser mayor a cero.");
    }
    if (input.quantity > currentStock) {
      throw new InventoryError(
        "INSUFFICIENT_STOCK",
        `No hay stock suficiente. Disponible: ${currentStock}.`,
      );
    }
    change = -input.quantity;
  } else {
    // ADJUSTMENT: quantity es el conteo real total.
    change = input.quantity - currentStock;
    if (change === 0) {
      throw new InventoryError("NO_CHANGE", "El conteo coincide con el stock actual; no hay ajuste que registrar.");
    }
  }

  return repository.createMovement({
    productId: input.productId,
    type: input.type,
    change,
    note: input.note ?? null,
    movementDate: input.movementDate,
    createdById: input.createdById,
  });
}

export async function listProductStocksUseCase(repository: InventoryRepository) {
  return repository.listProductStocks();
}

export async function listMovementsUseCase(repository: InventoryRepository) {
  return repository.listMovements();
}

export async function getMetricsUseCase(repository: InventoryRepository) {
  return repository.getMetrics();
}

export async function updateMinStockUseCase(
  repository: InventoryRepository,
  productId: string,
  minStock: number,
) {
  return repository.updateMinStock(productId, minStock);
}
