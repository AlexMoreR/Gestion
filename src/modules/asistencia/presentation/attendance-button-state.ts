import "server-only";
import type { Role } from "@prisma/client";
import { bogotaDay, bogotaTime } from "../domain/attendance";
import { getMyAttendanceUseCase } from "../application/use-cases";
import { createPrismaAsistenciaRepository } from "../infrastructure/prisma-asistencia-repository";
import type { AttendanceButtonState } from "@/components/attendance-button";

// Estado del boton "Marcar entrada / salida" de la barra. Solo Empleado y Admin marcan.
// Si algo falla (ej. la tabla aun no existe) la barra se muestra sin el boton: nunca rompe la pagina.
export async function loadAttendanceButtonState(
  userId: string | null | undefined,
  role: Role | null | undefined,
): Promise<AttendanceButtonState | null> {
  if (!userId || (role !== "ADMIN" && role !== "EMPLEADO")) return null;
  try {
    const now = new Date();
    const { next, today } = await getMyAttendanceUseCase(createPrismaAsistenciaRepository(), userId, now);
    // Turno que viene de anoche: se aclara "ayer" para no confundir la salida con la de hoy.
    const fromYesterday = next.openSince !== null && next.day !== bogotaDay(now);
    return {
      next: next.kind,
      openSince: next.openSince ? `${fromYesterday ? "ayer " : ""}${bogotaTime(next.openSince)}` : null,
      minutesToday: today.minutes,
      workedToday: today.worked,
    };
  } catch (error) {
    console.error("[asistencia] no se pudo cargar el estado del boton", error);
    return null;
  }
}
