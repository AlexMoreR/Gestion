"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { logActivity } from "@/lib/activity-log";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { prisma } from "@/lib/prisma";
import {
  ATTENDANCE_KIND_LABELS,
  ATTENDANCE_KINDS,
  bogotaTime,
  type AttendanceKind,
} from "@/modules/asistencia/domain/attendance";
import {
  AttendanceInputError,
  addMissingMarkUseCase,
  correctMarkUseCase,
  markForPersonUseCase,
  markOwnAttendanceUseCase,
  voidMarkUseCase,
  type ManualMarkInput,
} from "@/modules/asistencia/application/use-cases";
import { createPrismaAsistenciaRepository } from "@/modules/asistencia/infrastructure/prisma-asistencia-repository";

// Asistencia: cada Empleado/Admin marca la suya (hora del servidor). Marcar por otra persona y
// corregir es solo del dueno/admin, con motivo obligatorio y registro en la bitacora.
const BASE_PATH = "/admin/asistencia";
const asistencia = createPrismaAsistenciaRepository();

function field(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function kindParam(value: unknown): AttendanceKind | null {
  return ATTENDANCE_KINDS.includes(value as AttendanceKind) ? (value as AttendanceKind) : null;
}

// Vuelve a la pantalla de Asistencia conservando la vista y los filtros.
function back(formData: FormData, kind: "ok" | "error", message: string): never {
  const params = new URLSearchParams();
  for (const key of ["vista", "mes", "persona"]) {
    const value = field(formData, key);
    if (value) params.set(key, value);
  }
  params.set(kind, message);
  redirect(`${BASE_PATH}?${params.toString()}`);
}

function refresh(): void {
  revalidatePath(BASE_PATH);
  revalidatePath("/admin/comisiones/nomina");
  // La barra (boton de marcar) vive en el layout del sistema.
  revalidatePath("/", "layout");
}

// Id real del usuario en sesion (igual que en Nomina: si el id de la sesion quedo viejo, por correo).
async function sessionUserId(sessionUser: { id?: string | null; email?: string | null }): Promise<string | null> {
  if (!sessionUser.id) return null;
  const user =
    (await prisma.user.findUnique({ where: { id: sessionUser.id }, select: { id: true } })) ??
    (sessionUser.email ? await prisma.user.findUnique({ where: { email: sessionUser.email }, select: { id: true } }) : null);
  return user?.id ?? null;
}

async function requireOwner(): Promise<string> {
  const session = await auth();
  if (
    !session?.user?.id ||
    session.user.role !== "ADMIN" ||
    !(await hasAdminModuleAccess(session.user.id, session.user.role, "attendance"))
  ) {
    redirect("/unauthorized");
  }
  const userId = await sessionUserId(session.user);
  if (!userId) redirect("/login");
  return userId;
}

export type MarkAttendanceResult = { ok: boolean; message: string };

// Boton de la barra: la persona en sesion marca su entrada o su salida. No recibe hora.
export async function marcarAsistenciaAction(expected: string): Promise<MarkAttendanceResult> {
  const session = await auth();
  if (!session?.user?.id || (session.user.role !== "ADMIN" && session.user.role !== "EMPLEADO")) {
    return { ok: false, message: "Solo el equipo de trabajo marca asistencia." };
  }
  const kind = kindParam(expected);
  if (!kind) return { ok: false, message: "Datos inválidos." };
  const userId = await sessionUserId(session.user);
  if (!userId) return { ok: false, message: "Vuelve a iniciar sesión." };
  try {
    const mark = await markOwnAttendanceUseCase(asistencia, userId, kind);
    refresh();
    return {
      ok: true,
      message: `${ATTENDANCE_KIND_LABELS[mark.kind]} marcada a las ${bogotaTime(mark.markedAt)}.`,
    };
  } catch (error) {
    refresh();
    if (error instanceof AttendanceInputError) return { ok: false, message: error.message };
    console.error("[asistencia] error al marcar", error);
    return { ok: false, message: "No se pudo marcar. Intenta de nuevo." };
  }
}

// Un admin marca por alguien que no puede hacerlo (hora del servidor, queda "marcada por").
export async function marcarPorPersonaAction(formData: FormData): Promise<void> {
  const adminId = await requireOwner();
  const userId = field(formData, "userId");
  const kind = kindParam(field(formData, "tipo"));
  if (!userId || !kind) back(formData, "error", "Datos inválidos");
  let message: string;
  try {
    const { mark, person } = await markForPersonUseCase(asistencia, adminId, userId, kind as AttendanceKind);
    message = `${ATTENDANCE_KIND_LABELS[mark.kind]} de ${person.name} marcada a las ${bogotaTime(mark.markedAt)}`;
    await logActivity({
      action: "CREATE",
      entityType: "ATTENDANCE",
      entityId: mark.id,
      summary: `Marcó la ${ATTENDANCE_KIND_LABELS[mark.kind].toLowerCase()} de ${person.name} (${mark.day} ${bogotaTime(mark.markedAt)}) por esa persona`,
    });
  } catch (error) {
    if (error instanceof AttendanceInputError) back(formData, "error", error.message);
    throw error;
  }
  refresh();
  back(formData, "ok", message);
}

function manualInput(formData: FormData): ManualMarkInput | null {
  const kind = kindParam(field(formData, "tipo"));
  if (!kind) return null;
  return {
    kind,
    day: field(formData, "dia"),
    time: field(formData, "hora"),
    nextDay: formData.get("diaSiguiente") === "on",
    reason: field(formData, "motivo"),
  };
}

// Agrega una marca olvidada o corrige una existente (si viene markId). Motivo obligatorio.
export async function corregirMarcaAction(formData: FormData): Promise<void> {
  const adminId = await requireOwner();
  const markId = field(formData, "markId");
  const userId = field(formData, "userId");
  const input = manualInput(formData);
  if (!input || (!markId && !userId)) back(formData, "error", "Datos inválidos");
  const data = input as ManualMarkInput;
  let message: string;
  try {
    if (markId) {
      const { original, mark } = await correctMarkUseCase(asistencia, adminId, markId, data);
      message = "Marca corregida";
      await logActivity({
        action: "UPDATE",
        entityType: "ATTENDANCE",
        entityId: mark.id,
        summary: `Corrigió una marca de asistencia (${ATTENDANCE_KIND_LABELS[original.kind]} ${original.day} ${bogotaTime(original.markedAt)} → ${ATTENDANCE_KIND_LABELS[mark.kind]} ${mark.day} ${bogotaTime(mark.markedAt)}). Motivo: ${mark.reason}`,
      });
    } else {
      const { mark, person } = await addMissingMarkUseCase(asistencia, adminId, userId, data);
      message = `Marca agregada a ${person.name}`;
      await logActivity({
        action: "CREATE",
        entityType: "ATTENDANCE",
        entityId: mark.id,
        summary: `Agregó una ${ATTENDANCE_KIND_LABELS[mark.kind].toLowerCase()} olvidada de ${person.name} (${mark.day} ${bogotaTime(mark.markedAt)}). Motivo: ${mark.reason}`,
      });
    }
  } catch (error) {
    if (error instanceof AttendanceInputError) back(formData, "error", error.message);
    throw error;
  }
  refresh();
  back(formData, "ok", message);
}

// Anula una marca mal hecha (ej. una entrada repetida). No se borra: queda anulada con el motivo.
export async function anularMarcaAction(formData: FormData): Promise<void> {
  const adminId = await requireOwner();
  const markId = field(formData, "markId");
  if (!markId) back(formData, "error", "Datos inválidos");
  try {
    const original = await voidMarkUseCase(asistencia, adminId, markId, field(formData, "motivo"));
    await logActivity({
      action: "UPDATE",
      entityType: "ATTENDANCE",
      entityId: original.id,
      summary: `Anuló una marca de asistencia (${ATTENDANCE_KIND_LABELS[original.kind]} ${original.day} ${bogotaTime(original.markedAt)}). Motivo: ${field(formData, "motivo")}`,
    });
  } catch (error) {
    if (error instanceof AttendanceInputError) back(formData, "error", error.message);
    throw error;
  }
  refresh();
  back(formData, "ok", "Marca anulada");
}
