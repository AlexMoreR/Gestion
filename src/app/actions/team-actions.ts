"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/auth";
import { logActivity } from "@/lib/activity-log";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { saveTeamMemberUseCase, setTeamExitUseCase, TeamInputError } from "@/modules/equipo/application/use-cases";
import { isIsoDay, TEAM_EMPLOYMENT_TYPES, TEAM_PAY_TYPES, todayInBogota } from "@/modules/equipo/domain/team-member";
import { createPrismaTeamRepository } from "@/modules/equipo/infrastructure/prisma-team-repository";

// Equipo: solo el dueno/admin crea, edita y da de baja. La bitacora no copia datos personales.
const BASE_PATH = "/admin/equipo";
const team = createPrismaTeamRepository();

function field(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function back(formData: FormData, kind: "ok" | "error", message: string): never {
  const params = new URLSearchParams();
  const estado = field(formData, "estado");
  if (estado) params.set("estado", estado);
  params.set(kind, message);
  redirect(`${BASE_PATH}?${params.toString()}`);
}

async function requireOwner(): Promise<void> {
  const session = await auth();
  if (
    !session?.user?.id ||
    session.user.role !== "ADMIN" ||
    !(await hasAdminModuleAccess(session.user.id, session.user.role, "team"))
  ) {
    redirect("/unauthorized");
  }
}

const optionalText = (max: number) =>
  z
    .string()
    .max(max, `Máximo ${max} caracteres`)
    .transform((value) => (value ? value : null));

const optionalDay = z
  .string()
  .refine((value) => !value || isIsoDay(value), "Fecha inválida")
  .transform((value) => (value ? value : null));

const memberSchema = z.object({
  fullName: z.string().min(2, "Escribe el nombre completo").max(120),
  userId: optionalText(64),
  document: optionalText(30),
  birthDate: optionalDay,
  phone: optionalText(30),
  email: z
    .string()
    .max(120)
    .refine((value) => !value || z.email().safeParse(value).success, "Correo inválido")
    .transform((value) => (value ? value.toLowerCase() : null)),
  address: optionalText(200),
  emergencyName: optionalText(120),
  emergencyPhone: optionalText(30),
  jobTitle: optionalText(60),
  isOwner: z.boolean(),
  employmentType: z.enum(TEAM_EMPLOYMENT_TYPES),
  payType: z
    .union([z.enum(TEAM_PAY_TYPES), z.literal("")])
    .transform((value) => (value ? value : null)),
  startDate: optionalDay,
  endDate: optionalDay,
  exitReason: optionalText(300),
  notes: optionalText(500),
});

export async function saveTeamMemberAction(formData: FormData) {
  await requireOwner();
  const memberId = field(formData, "memberId") || null;
  const parsed = memberSchema.safeParse({
    fullName: field(formData, "fullName"),
    userId: field(formData, "userId"),
    document: field(formData, "document"),
    birthDate: field(formData, "birthDate"),
    phone: field(formData, "phone"),
    email: field(formData, "email"),
    address: field(formData, "address"),
    emergencyName: field(formData, "emergencyName"),
    emergencyPhone: field(formData, "emergencyPhone"),
    jobTitle: field(formData, "jobTitle"),
    isOwner: formData.get("isOwner") === "on",
    employmentType: field(formData, "employmentType") || "FREELANCE",
    payType: field(formData, "payType"),
    startDate: field(formData, "startDate"),
    endDate: field(formData, "endDate"),
    exitReason: field(formData, "exitReason"),
    notes: field(formData, "notes"),
  });
  if (!parsed.success) {
    back(formData, "error", parsed.error.issues[0]?.message ?? "Datos inválidos");
  }
  const input = { ...parsed.data, exitReason: parsed.data.endDate ? parsed.data.exitReason : null };

  let saved;
  try {
    saved = await saveTeamMemberUseCase(team, memberId, input, todayInBogota());
  } catch (error) {
    if (error instanceof TeamInputError) back(formData, "error", error.message);
    throw error;
  }

  await logActivity({
    action: memberId ? "UPDATE" : "CREATE",
    entityType: "TEAM_MEMBER",
    entityId: saved.id,
    summary: memberId ? `Editó la ficha de ${saved.fullName} en Equipo` : `Creó la ficha de ${saved.fullName} en Equipo`,
  });
  revalidatePath(BASE_PATH);
  revalidatePath("/admin/comisiones/nomina");
  back(formData, "ok", memberId ? "Ficha actualizada" : "Ficha creada");
}

// Dar de baja: fecha de salida (ultimo dia trabajado) + motivo. Reactivar: quita la salida.
export async function setTeamExitAction(formData: FormData) {
  await requireOwner();
  const memberId = field(formData, "memberId");
  const reactivate = field(formData, "reactivar") === "1";
  const endDate = reactivate ? null : field(formData, "endDate");
  const exitReason = field(formData, "exitReason").slice(0, 300) || null;
  if (!memberId) back(formData, "error", "Falta la persona.");
  if (!reactivate && !isIsoDay(endDate)) back(formData, "error", "Escribe la fecha de salida.");

  let saved;
  try {
    saved = await setTeamExitUseCase(team, memberId, endDate, exitReason);
  } catch (error) {
    if (error instanceof TeamInputError) back(formData, "error", error.message);
    throw error;
  }

  await logActivity({
    action: "UPDATE",
    entityType: "TEAM_MEMBER",
    entityId: saved.id,
    summary: reactivate
      ? `Reactivó a ${saved.fullName} en Equipo (quitó la fecha de salida)`
      : `Dio de baja a ${saved.fullName} en Equipo (salida ${saved.endDate})`,
  });
  revalidatePath(BASE_PATH);
  revalidatePath("/admin/comisiones/nomina");
  back(formData, "ok", reactivate ? "Persona reactivada" : "Persona dada de baja");
}
