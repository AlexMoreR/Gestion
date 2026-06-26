import "server-only";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export type ActivityActionType = "CREATE" | "UPDATE" | "DELETE";

/**
 * Tipos de entidad auditables. Se usan como filtro en la pantalla de actividad.
 */
export type ActivityEntityType =
  | "PRODUCT"
  | "QUOTE"
  | "ORDER"
  | "SALE"
  | "EXPENSE"
  | "EXPENSE_CATEGORY"
  | "INVENTORY"
  | "PURCHASE"
  | "CATEGORY"
  | "SUPPLIER"
  | "ACCOUNT";

type LogActivityInput = {
  action: ActivityActionType;
  entityType: ActivityEntityType;
  entityId?: string | null;
  summary: string;
};

/**
 * Registra una actividad del usuario autenticado.
 *
 * Nunca lanza: si falla el registro no debe romper la accion principal.
 */
export async function logActivity(input: LogActivityInput): Promise<void> {
  try {
    const session = await auth();
    const user = session?.user;
    if (!user?.id) {
      return;
    }

    await prisma.activityLog.create({
      data: {
        actorId: user.id,
        actorName: user.name?.trim() || user.email?.trim() || "Desconocido",
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        summary: input.summary.slice(0, 500),
      },
    });
  } catch {
    // Auditoria no critica: ignorar errores para no bloquear la operacion.
  }
}
