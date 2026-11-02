/**
 * Foto de una fila para la bitácora ("antes"/"después"): solo los campos pedidos,
 * con Decimal → número y Date → texto ISO. Quien llama no pide fotos, comprobantes ni blobs.
 */
export type SnapshotValue = string | number | boolean | null;

function toPlain(value: unknown): SnapshotValue {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return Number(value);
  // Prisma.Decimal (y cualquier objeto con toNumber).
  if (typeof (value as { toNumber?: unknown }).toNumber === "function") {
    return (value as { toNumber: () => number }).toNumber();
  }
  return String(value);
}

export function snapshotForLog<T extends object, K extends keyof T & string>(
  row: T,
  campos: readonly K[],
): Record<K, SnapshotValue> {
  const out = {} as Record<K, SnapshotValue>;
  for (const campo of campos) {
    out[campo] = toPlain(row[campo]);
  }
  return out;
}

/** Campos de un movimiento de proveedora (cargo/abono) que se copian a la bitácora. */
export const SUPPLIER_LEDGER_LOG_FIELDS = [
  "id",
  "code",
  "supplierId",
  "type",
  "amount",
  "saleId",
  "orderId",
  "orderItemId",
  "dispatchId",
  "transactionReference",
  "paymentDate",
  "accountId",
  "settlesEntryId",
  "note",
  "receiptName",
  "createdById",
  "createdAt",
] as const;

/** Campos de un flete (ShippingCost) que se copian a la bitácora. */
export const SHIPPING_COST_LOG_FIELDS = [
  "id",
  "saleId",
  "shippingProvider",
  "amount",
  "transactionReference",
  "paymentDate",
  "accountId",
  "supplierPaymentId",
  "createdById",
  "createdAt",
] as const;

export type JsonCopy = string | number | boolean | null | JsonCopy[] | { [key: string]: JsonCopy };

/**
 * Copia completa (con lo anidado) para la bitácora antes de un borrado definitivo:
 * Decimal → texto, Date → texto ISO. La base no guarda archivos, solo sus rutas.
 */
export function fullCopyForLog(value: object): { [key: string]: JsonCopy } {
  return JSON.parse(JSON.stringify(value));
}
