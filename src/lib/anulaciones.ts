import type { Prisma } from "@prisma/client";

/** Tablas con plata que se pueden anular. */
export type TablaAnulable = "SalePayment" | "Expense";

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
};

export const MOTIVO_ANULACION_MIN = 3;
export const MOTIVO_ANULACION_ERROR = "Escribe el motivo de la anulación (mínimo 3 letras)";

const ENTIDAD: Record<TablaAnulable, { entityType: string; nombre: string }> = {
  SalePayment: { entityType: "SALE", nombre: "un abono" },
  Expense: { entityType: "EXPENSE", nombre: "un gasto" },
};

/**
 * El ÚNICO lugar que borra filas con plata (abonos y gastos): exige motivo, guarda la fila
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

  if (input.tabla === "SalePayment") {
    await tx.salePayment.delete({ where: { id: input.registro.id } });
  } else {
    await tx.expense.delete({ where: { id: input.registro.id } });
  }

  const { entityType, nombre } = ENTIDAD[input.tabla];
  const deCodigo = input.codigo ? ` de ${input.codigo}` : "";
  await tx.activityLog.create({
    data: {
      actorId: input.usuarioId,
      actorName: input.usuarioNombre?.trim() || "Desconocido",
      action: "DELETE",
      entityType,
      entityId: input.registro.id,
      entityCode: input.codigo ?? null,
      summary: `Anuló ${nombre} de $${monto.toLocaleString("es-CO")}${deCodigo} (${motivo})`.slice(0, 500),
      before: datos,
      origin: origen,
    },
  });
}
