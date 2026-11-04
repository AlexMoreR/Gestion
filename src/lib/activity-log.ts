import "server-only";
import type { Prisma } from "@prisma/client";
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
  | "ACCOUNT"
  | "SHIPMENT"
  | "PAYROLL"
  | "TEAM_MEMBER"
  | "ATTENDANCE"
  | "DUDAS_ACCESS"
  | "CARTA_COLORES"
  | "COLOR";

/** Desde dónde se hizo el cambio. Sin valor se guarda "PANTALLA". */
export type ActivityOrigin = "PANTALLA" | "MCP" | "CRM" | "SCRIPT" | "MIGRACION" | "COORDINADOR";

export type ActivityActor = { id: string; name?: string | null; email?: string | null };

type LogActivityInput = {
  action: ActivityActionType;
  entityType: ActivityEntityType;
  entityId?: string | null;
  /** Código legible de la cosa (p. ej. "SAL-0123"). */
  entityCode?: string | null;
  summary: string;
  /** Cómo estaba antes (usar snapshotForLog). */
  before?: Prisma.InputJsonValue | null;
  /** Cómo quedó después (usar snapshotForLog). */
  after?: Prisma.InputJsonValue | null;
  origin?: ActivityOrigin;
  ticket?: string | null;
  commitSha?: string | null;
};

function buildData(actor: ActivityActor, input: LogActivityInput): Prisma.ActivityLogUncheckedCreateInput {
  return {
    actorId: actor.id,
    actorName: actor.name?.trim() || actor.email?.trim() || "Desconocido",
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    entityCode: input.entityCode ?? null,
    summary: input.summary.slice(0, 500),
    // undefined deja la columna en NULL (Prisma no acepta null directo en Json).
    before: input.before ?? undefined,
    after: input.after ?? undefined,
    origin: input.origin ?? "PANTALLA",
    ticket: input.ticket ?? null,
    commitSha: input.commitSha ?? null,
  };
}

/**
 * Registra una actividad a nombre de un usuario dado (APIs sin sesion, p. ej. el CRM).
 * Nunca lanza.
 */
export async function logActivityAs(actor: ActivityActor, input: LogActivityInput): Promise<void> {
  try {
    await prisma.activityLog.create({ data: buildData(actor, input) });
  } catch {
    // Auditoria no critica.
  }
}

/** Quién hace la acción (para logActivityTx). Lanza si no hay sesión. */
export async function getActivityActor(): Promise<ActivityActor> {
  const user = (await auth())?.user;
  if (!user?.id) {
    throw new Error("Sin sesión para anotar en la bitácora");
  }
  return { id: user.id, name: user.name, email: user.email };
}

/**
 * Registra una actividad dentro de una transacción de Prisma.
 *
 * SÍ lanza: si no se puede anotar, la transacción se deshace (p. ej. un borrado sin nota no se hace).
 */
export async function logActivityTx(
  tx: Prisma.TransactionClient,
  actor: ActivityActor,
  input: LogActivityInput,
): Promise<void> {
  await tx.activityLog.create({ data: buildData(actor, input) });
}

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

    await prisma.activityLog.create({ data: buildData(user, input) });
  } catch {
    // Auditoria no critica: ignorar errores para no bloquear la operacion.
  }
}
