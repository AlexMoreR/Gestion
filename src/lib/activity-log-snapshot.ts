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
