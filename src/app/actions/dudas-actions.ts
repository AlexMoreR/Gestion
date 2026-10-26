"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { logActivity } from "@/lib/activity-log";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { crearAcceso, entrarConCodigo, guardarRespuesta } from "@/modules/dudas/application/use-cases";
import { formatearCodigo } from "@/modules/dudas/domain/codigo";
import { ipDelCliente } from "@/modules/dudas/domain/freno-intentos";
import { COOKIE_SESION_DUDAS, DURACION_SESION_MS } from "@/modules/dudas/domain/sesion";
import { createDudasDeps, createPrismaDudasRepository, hashearCodigo } from "@/modules/dudas/infrastructure/prisma-dudas-repository";

// Dudas del catalogo: /dudas (asesoras con nombre + codigo, sin cuenta) y /admin/dudas (solo admin).

function campo(formData: FormData, clave: string): string {
  const valor = formData.get(clave);
  return typeof valor === "string" ? valor : "";
}

export type EstadoEntrar = { error: string | null };

export async function entrarDudasAction(_previo: EstadoEntrar, formData: FormData): Promise<EstadoEntrar> {
  const ip = ipDelCliente(await headers());
  let resultado: Awaited<ReturnType<typeof entrarConCodigo>>;
  try {
    resultado = await entrarConCodigo(createDudasDeps(), {
      nombre: campo(formData, "nombre"),
      codigo: campo(formData, "codigo"),
      ip,
    });
  } catch (error) {
    console.error("[dudas] Fallo al entrar:", error);
    return { error: "No pudimos revisar el código. Intenta de nuevo en un momento." };
  }
  if (!resultado.ok) return { error: resultado.error };

  (await cookies()).set(COOKIE_SESION_DUDAS, resultado.token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/dudas",
    maxAge: Math.floor(DURACION_SESION_MS / 1000),
  });
  redirect("/dudas");
}

export async function salirDudasAction(): Promise<void> {
  (await cookies()).delete({ name: COOKIE_SESION_DUDAS, path: "/dudas" });
  redirect("/dudas");
}

export type ResultadoGuardarAccion =
  | { ok: true; autorNombre: string; fecha: string; opcionId: string; opcionTexto: string; texto: string; nota: string }
  | { ok: false; error: string; sinSesion?: boolean };

export async function guardarRespuestaDudaAction(entrada: {
  dudaId: string;
  opcionId: string;
  texto: string;
  nota: string;
}): Promise<ResultadoGuardarAccion> {
  const token = (await cookies()).get(COOKIE_SESION_DUDAS)?.value;
  try {
    const resultado = await guardarRespuesta(createDudasDeps(), token, {
      dudaId: String(entrada.dudaId ?? ""),
      opcionId: String(entrada.opcionId ?? ""),
      texto: String(entrada.texto ?? ""),
      nota: String(entrada.nota ?? ""),
    });
    if (!resultado.ok) return resultado;
    const r = resultado.respuesta;
    revalidatePath("/admin/dudas");
    return {
      ok: true,
      autorNombre: r.autorNombre,
      fecha: r.createdAt.toISOString(),
      opcionId: r.opcionId,
      opcionTexto: r.opcionTexto,
      texto: r.texto,
      nota: r.nota,
    };
  } catch (error) {
    console.error("[dudas] Fallo al guardar respuesta:", error);
    return { ok: false, error: "No se pudo guardar. Revisa tu conexión e intenta otra vez." };
  }
}

// --- Admin ---

async function exigirAdmin(): Promise<void> {
  const session = await auth();
  const ok =
    session?.user?.role === "ADMIN" && (await hasAdminModuleAccess(session.user.id, session.user.role, "dudas"));
  if (!ok) redirect("/unauthorized");
}

export type EstadoCrearAcceso = { error: string | null; nombre?: string; codigo?: string };

export async function crearAccesoDudasAction(_previo: EstadoCrearAcceso, formData: FormData): Promise<EstadoCrearAcceso> {
  await exigirAdmin();
  const resultado = await crearAcceso(createPrismaDudasRepository(), hashearCodigo, campo(formData, "nombre"));
  if (!resultado.ok) return { error: resultado.error };
  await logActivity({
    action: "CREATE",
    entityType: "DUDAS_ACCESS",
    entityId: resultado.acceso.id,
    summary: `Creó un acceso a Dudas del catálogo para ${resultado.acceso.nombre}`,
  });
  revalidatePath("/admin/dudas");
  // El codigo solo vuelve aqui, una vez; en la BD queda solo el hash.
  return { error: null, nombre: resultado.acceso.nombre, codigo: formatearCodigo(resultado.codigo) };
}

export async function desactivarAccesoDudasAction(formData: FormData): Promise<void> {
  await exigirAdmin();
  const id = campo(formData, "id");
  if (id) {
    const repo = createPrismaDudasRepository();
    const acceso = await repo.buscarAcceso(id);
    if (acceso?.activo) {
      await repo.desactivarAcceso(id);
      await logActivity({
        action: "UPDATE",
        entityType: "DUDAS_ACCESS",
        entityId: id,
        summary: `Desactivó el acceso a Dudas del catálogo de ${acceso.nombre}`,
      });
    }
  }
  revalidatePath("/admin/dudas");
  redirect("/admin/dudas?ok=Acceso%20desactivado");
}
