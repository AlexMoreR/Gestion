import type { Prisma } from "@prisma/client";

/** Tablas con plata que se pueden anular. */
export type TablaAnulable = "SalePayment" | "Expense" | "InventoryMovement" | "SupplierLedgerEntry";

export type AnularInput = {
  tabla: TablaAnulable;
  /** La fila completa tal como está en la base (se copia antes de borrarla). */
  registro: { id: string } & Record<string, unknown>;
  codigo?: string | null;
  monto: number | Prisma.Decimal;
  motivo: string;
  /** Desde dónde se anuló ("PANTALLA", "MCP"...). */
  origen?: string;
  usuarioId: string;
  /** Nombre para la bitácora. */
  usuarioNombre?: string | null;
  /** Qué se anula, para la bitácora ("un pago a Rosa"); si falta, el nombre de la tabla. */
  que?: string;
};

export const MOTIVO_ANULACION_MIN = 3;
export const MOTIVO_ANULACION_ERROR = "Escribe el motivo de la anulación (mínimo 3 letras)";

const ENTIDAD: Record<TablaAnulable, { entityType: string; nombre: string }> = {
  SalePayment: { entityType: "SALE", nombre: "un abono" },
  Expense: { entityType: "EXPENSE", nombre: "un gasto" },
  InventoryMovement: { entityType: "INVENTORY", nombre: "un movimiento de inventario" },
  SupplierLedgerEntry: { entityType: "SUPPLIER", nombre: "un movimiento de proveedora" },
};

export const PRIMERO_ANULA_ABONOS = "Primero anula los abonos";

/**
 * Un cargo a la proveedora con abonos que lo saldan no se anula: borrarlo se llevaría
 * esos abonos en cascada. Devuelve el mensaje de bloqueo o null si se puede anular.
 */
export function bloqueoPorAbonos(abonosQueLoSaldan: number): string | null {
  return abonosQueLoSaldan > 0 ? PRIMERO_ANULA_ABONOS : null;
}

/**
 * El ÚNICO lugar que borra filas con plata (abonos, gastos, movimientos de inventario y de proveedoras): exige motivo, guarda la fila
 * completa en RegistroAnulado, borra el original y anota "Anuló … (motivo)" en ActivityLog.
 * Todo en la misma transacción `tx`: si algo falla, no se borra nada.
 */
export async function anularConMotivo(tx: Prisma.TransactionClient, input: AnularInput): Promise<void> {
  const motivo = input.motivo.trim();
  if (motivo.length < MOTIVO_ANULACION_MIN) {
    throw new Error(MOTIVO_ANULACION_ERROR);
  }
  const origen = input.origen ?? "PANTALLA";
  const monto = Number(input.monto);
  // Decimal → texto, Date → ISO: la copia queda tal cual se leyó.
  const datos = JSON.parse(JSON.stringify(input.registro)) as Prisma.InputJsonValue;

  await tx.registroAnulado.create({
    data: {
      tabla: input.tabla,
      registroId: input.registro.id,
      codigo: input.codigo ?? null,
      monto,
      datos,
      motivo,
      origen,
      anuladoPorId: input.usuarioId,
    },
  });

  const where = { where: { id: input.registro.id } };
  if (input.tabla === "SalePayment") await tx.salePayment.delete(where);
  else if (input.tabla === "Expense") await tx.expense.delete(where);
  else if (input.tabla === "InventoryMovement") await tx.inventoryMovement.delete(where);
  else await tx.supplierLedgerEntry.delete(where);

  const { entityType } = ENTIDAD[input.tabla];
  const nombre = input.que ?? ENTIDAD[input.tabla].nombre;
  const deCodigo = input.codigo ? ` de ${input.codigo}` : "";
  await tx.activityLog.create({
    data: {
      actorId: input.usuarioId,
      actorName: input.usuarioNombre?.trim() || "Desconocido",
      action: "DELETE",
      entityType,
      entityId: input.registro.id,
      entityCode: input.codigo ?? null,
      // Un movimiento de inventario no tiene plata: sin "de $0".
      summary: `Anuló ${nombre}${monto ? ` de $${monto.toLocaleString("es-CO")}` : ""}${deCodigo} (${motivo})`.slice(0, 500),
      before: datos,
      origin: origen,
    },
  });
}
