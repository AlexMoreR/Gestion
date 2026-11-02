import type { Prisma } from "@prisma/client";
import type { ActivityEntityType, ActivityOrigin } from "./activity-log";

/**
 * Lo que tiene plata no se borra: se anula con motivo.
 * Este es el ÚNICO lugar del código que borra filas con plata (abonos, gastos): antes de borrar
 * guarda la fila completa en RegistroAnulado y anota en la bitácora, todo en la misma transacción.
 */
export type TablaAnulable = "SalePayment" | "Expense";

export class AnulacionError extends Error {}

type TxAnulacion = Pick<Prisma.TransactionClient, "registroAnulado" | "activityLog" | "salePayment" | "expense">;

export type AnularInput = {
  tabla: TablaAnulable;
  registro: { id: string } & Record<string, unknown>;
  codigo?: string | null;
  monto: number;
  motivo: string | null | undefined;
  origen?: ActivityOrigin;
  usuarioId: string;
  usuarioNombre?: string | null;
  /** Dónde queda en la bitácora y cómo se lee ("un abono de $50.000 de SAL-123"). */
  bitacora: { entityType: ActivityEntityType; entityId: string; descripcion: string };
};

export function validarMotivoAnulacion(motivo: string | null | undefined): string {
  const limpio = (motivo ?? "").trim();
  if (limpio.length < 3) throw new AnulacionError("Escribe el motivo (mínimo 3 letras)");
  if (limpio.length > 300) throw new AnulacionError("El motivo puede tener máximo 300 caracteres");
  return limpio;
}

export async function anularConMotivo(tx: TxAnulacion, input: AnularInput): Promise<void> {
  const motivo = validarMotivoAnulacion(input.motivo);
  const origen = input.origen ?? "PANTALLA";
  // Decimal → texto y Date → ISO: copia fiel de la fila para JSONB.
  const datos = JSON.parse(JSON.stringify(input.registro)) as Prisma.InputJsonObject;

  await tx.registroAnulado.create({
    data: {
      tabla: input.tabla,
      registroId: input.registro.id,
      codigo: input.codigo ?? null,
      monto: input.monto,
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

  await tx.activityLog.create({
    data: {
      actorId: input.usuarioId,
      actorName: input.usuarioNombre?.trim() || "Desconocido",
      action: "DELETE",
      entityType: input.bitacora.entityType,
      entityId: input.bitacora.entityId,
      entityCode: input.codigo ?? null,
      summary: `Anuló ${input.bitacora.descripcion} (${motivo})`.slice(0, 500),
      before: datos,
      origin: origen,
    },
  });
}
