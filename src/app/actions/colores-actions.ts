"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { logActivity } from "@/lib/activity-log";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { prisma } from "@/lib/prisma";
import { hasUploadedFile, saveColorSwatchPhoto } from "@/lib/upload-photo";
import { etiquetaColor, validarColor } from "@/modules/colores/domain/carta-colores";

// Carta de colores (cueros y telas). Nada se borra: solo se oculta.

const RUTA = "/admin/colores";

async function requireColoresAccess(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id || !(await hasAdminModuleAccess(session.user.id, session.user.role, "colores"))) {
    redirect("/unauthorized");
  }
  return session.user.id;
}

function texto(formData: FormData, campo: string): string {
  const value = formData.get(campo);
  return typeof value === "string" ? value.trim() : "";
}

function volver(tipo: "ok" | "error", mensaje: string): never {
  redirect(`${RUTA}?${tipo}=${encodeURIComponent(mensaje)}`);
}

function refrescar(): void {
  revalidatePath(RUTA);
  revalidatePath("/colores");
}

type DatosColor = { materialId: string; codigo: string; nombre: string; hex: string | null };

// Lee y valida el formulario; si algo falla, vuelve a la pantalla con el error.
async function leerColor(formData: FormData) {
  const datos: DatosColor = {
    materialId: texto(formData, "materialId"),
    codigo: texto(formData, "codigo"),
    nombre: texto(formData, "nombre"),
    hex: texto(formData, "hex") || null,
  };
  const errores = validarColor(datos);
  if (errores.length > 0) volver("error", errores.join(". "));

  const material = datos.materialId
    ? await prisma.colorMaterial.findUnique({ where: { id: datos.materialId }, select: { id: true, nombre: true } })
    : null;
  if (!material) volver("error", "Elige un material");

  const foto = formData.get("foto");
  let fotoUrl: string | null = null;
  if (hasUploadedFile(foto)) {
    try {
      fotoUrl = (await saveColorSwatchPhoto(foto)).url;
    } catch (error) {
      volver("error", error instanceof Error ? error.message : "La foto no se pudo guardar");
    }
  }
  return { datos, material, fotoUrl };
}

function esCodigoRepetido(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function crearColorAction(formData: FormData): Promise<void> {
  const userId = await requireColoresAccess();
  const { datos, material, fotoUrl } = await leerColor(formData);
  const etiqueta = etiquetaColor(material, datos);

  let colorId: string;
  try {
    const color = await prisma.cartaColor.create({
      data: { ...datos, fotoUrl, createdById: userId },
      select: { id: true },
    });
    colorId = color.id;
  } catch (error) {
    if (esCodigoRepetido(error)) volver("error", `Ya existe un color con el código ${datos.codigo} en este material (${material.nombre})`);
    throw error;
  }

  await logActivity({
    action: "CREATE",
    entityType: "COLOR",
    entityId: colorId,
    entityCode: etiqueta,
    summary: `Agregó el color ${etiqueta}`,
    after: { ...datos, fotoUrl },
  });
  refrescar();
  volver("ok", `Color ${etiqueta} agregado`);
}

export async function editarColorAction(formData: FormData): Promise<void> {
  await requireColoresAccess();
  const colorId = texto(formData, "colorId");
  const antes = colorId ? await prisma.cartaColor.findUnique({ where: { id: colorId } }) : null;
  if (!antes) volver("error", "No se encontró el color");

  const { datos, material, fotoUrl } = await leerColor(formData);
  const etiqueta = etiquetaColor(material, datos);
  // Sin foto nueva se deja la que había (la vieja queda en el disco: nada se borra).
  const data = fotoUrl ? { ...datos, fotoUrl } : datos;

  try {
    await prisma.cartaColor.update({ where: { id: colorId }, data });
  } catch (error) {
    if (esCodigoRepetido(error)) volver("error", `Ya existe un color con el código ${datos.codigo} en este material (${material.nombre})`);
    throw error;
  }

  await logActivity({
    action: "UPDATE",
    entityType: "COLOR",
    entityId: colorId,
    entityCode: etiqueta,
    summary: `Editó el color ${etiqueta}`,
    before: { materialId: antes.materialId, codigo: antes.codigo, nombre: antes.nombre, hex: antes.hex, fotoUrl: antes.fotoUrl },
    after: { ...datos, fotoUrl: fotoUrl ?? antes.fotoUrl },
  });
  refrescar();
  volver("ok", `Color ${etiqueta} guardado`);
}

/** Ocultar o mostrar un color (oculto = "1" lo oculta, "0" lo muestra). */
export async function ocultarColorAction(formData: FormData): Promise<void> {
  await requireColoresAccess();
  const colorId = texto(formData, "colorId");
  const oculto = texto(formData, "oculto") === "1";
  const color = colorId
    ? await prisma.cartaColor.findUnique({ where: { id: colorId }, include: { material: { select: { nombre: true } } } })
    : null;
  if (!color) volver("error", "No se encontró el color");

  await prisma.cartaColor.update({ where: { id: colorId }, data: { oculto } });
  const etiqueta = etiquetaColor(color.material, color);
  await logActivity({
    action: "UPDATE",
    entityType: "COLOR",
    entityId: colorId,
    entityCode: etiqueta,
    summary: `${oculto ? "Ocultó" : "Mostró"} el color ${etiqueta}`,
    before: { oculto: color.oculto },
    after: { oculto },
  });
  refrescar();
  volver("ok", `Color ${etiqueta} ${oculto ? "oculto" : "visible"}`);
}

/** Ocultar o mostrar un material completo (oculto = "1" lo oculta, "0" lo muestra). */
export async function ocultarMaterialAction(formData: FormData): Promise<void> {
  await requireColoresAccess();
  const materialId = texto(formData, "materialId");
  const oculto = texto(formData, "oculto") === "1";
  const material = materialId ? await prisma.colorMaterial.findUnique({ where: { id: materialId } }) : null;
  if (!material) volver("error", "No se encontró el material");

  await prisma.colorMaterial.update({ where: { id: materialId }, data: { oculto } });
  await logActivity({
    action: "UPDATE",
    entityType: "COLOR",
    entityId: materialId,
    entityCode: material.nombre,
    summary: `${oculto ? "Ocultó" : "Mostró"} el material ${material.nombre}`,
    before: { oculto: material.oculto },
    after: { oculto },
  });
  refrescar();
  volver("ok", `Material ${material.nombre} ${oculto ? "oculto" : "visible"}`);
}
