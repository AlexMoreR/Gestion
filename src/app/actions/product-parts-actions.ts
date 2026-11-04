"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { getActivityActor, logActivityTx } from "@/lib/activity-log";
import { prisma } from "@/lib/prisma";
import { limpiarLista } from "@/lib/product-parts";

// Partes de color (nov-2026): plantilla de la categoría o partes propias del producto.
// Solo ADMIN. Guardar reemplaza toda la lista de una vez; cada guardado queda en la bitácora.

export type PartesColorResult = { ok: boolean; message: string };

const MAX_PARTES = 10;

const listaSchema = z.array(z.string().max(60, "Máximo 60 letras por material o acabado")).max(30, "Máximo 30 opciones");

const parteSchema = z
  .object({
    nombre: z.string().trim().min(1, "Cada parte necesita un nombre").max(40, "El nombre va hasta 40 letras"),
    tipo: z.enum(["CARTA", "ACABADOS"]),
    materiales: listaSchema,
    acabados: listaSchema,
  })
  .transform((parte) => ({
    nombre: parte.nombre,
    tipo: parte.tipo,
    // Solo se guarda la lista que usa el tipo.
    materiales: parte.tipo === "CARTA" ? limpiarLista(parte.materiales) : [],
    acabados: parte.tipo === "ACABADOS" ? limpiarLista(parte.acabados) : [],
  }))
  .refine((parte) => parte.tipo !== "CARTA" || parte.materiales.length > 0, {
    message: "Una parte de carta necesita al menos un material",
  })
  .refine((parte) => parte.tipo !== "ACABADOS" || parte.acabados.length > 0, {
    message: "Una parte de acabados necesita al menos un acabado",
  });

const guardarSchema = z.object({
  duenio: z.enum(["categoria", "producto"]),
  id: z.string().trim().min(1).max(60),
  partes: z.array(parteSchema).max(MAX_PARTES, `Máximo ${MAX_PARTES} partes`),
});

async function esAdmin(): Promise<boolean> {
  const session = await auth();
  return !!session?.user?.id && session.user.role === "ADMIN";
}

function revalidar(duenio: "categoria" | "producto", id: string) {
  if (duenio === "categoria") revalidatePath("/admin/categorias");
  else revalidatePath(`/admin/productos/${id}`);
}

export async function guardarPartesColorAction(input: unknown): Promise<PartesColorResult> {
  if (!(await esAdmin())) return { ok: false, message: "Solo un administrador puede cambiar las partes de color" };

  const parsed = guardarSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  const { duenio, id, partes } = parsed.data;

  const nombres = new Set(partes.map((p) => p.nombre.toLowerCase()));
  if (nombres.size !== partes.length) return { ok: false, message: "Hay dos partes con el mismo nombre" };

  const duenioData: { name: string; code: string | null } | null =
    duenio === "categoria"
      ? await prisma.category.findUnique({ where: { id }, select: { name: true } }).then((c) => c && { name: c.name, code: null })
      : await prisma.product.findUnique({ where: { id }, select: { name: true, code: true } });
  if (!duenioData) return { ok: false, message: duenio === "categoria" ? "La categoría no existe" : "El producto no existe" };

  const where = duenio === "categoria" ? { categoryId: id } : { productId: id };
  const actor = await getActivityActor();

  await prisma.$transaction(async (tx) => {
    const antes = await tx.parteColor.findMany({
      where,
      orderBy: { orden: "asc" },
      select: { nombre: true, tipo: true, materiales: true, acabados: true },
    });
    await tx.parteColor.deleteMany({ where });
    if (partes.length > 0) {
      await tx.parteColor.createMany({ data: partes.map((parte, orden) => ({ ...where, ...parte, orden })) });
    }
    await logActivityTx(tx, actor, {
      action: "UPDATE",
      entityType: duenio === "categoria" ? "CATEGORY" : "PRODUCT",
      entityId: id,
      entityCode: duenioData.code,
      summary: `Guardó ${partes.length} parte(s) de color de ${duenio === "categoria" ? "la categoría" : "el producto"} ${duenioData.name}: ${partes.map((p) => p.nombre).join(", ") || "ninguna"}`,
      before: antes,
      after: partes,
    });
  });

  revalidar(duenio, id);
  return { ok: true, message: partes.length > 0 ? "Partes de color guardadas" : "Partes de color quitadas" };
}

/** Quita las partes propias del producto: vuelve a usar la plantilla de su categoría. */
export async function usarPartesDeCategoriaAction(productId: unknown): Promise<PartesColorResult> {
  if (!(await esAdmin())) return { ok: false, message: "Solo un administrador puede cambiar las partes de color" };
  const parsed = z.string().trim().min(1).max(60).safeParse(productId);
  if (!parsed.success) return { ok: false, message: "Producto inválido" };

  const product = await prisma.product.findUnique({ where: { id: parsed.data }, select: { id: true, name: true, code: true } });
  if (!product) return { ok: false, message: "El producto no existe" };

  const actor = await getActivityActor();
  await prisma.$transaction(async (tx) => {
    const antes = await tx.parteColor.findMany({
      where: { productId: product.id },
      orderBy: { orden: "asc" },
      select: { nombre: true, tipo: true, materiales: true, acabados: true },
    });
    await tx.parteColor.deleteMany({ where: { productId: product.id } });
    await logActivityTx(tx, actor, {
      action: "UPDATE",
      entityType: "PRODUCT",
      entityId: product.id,
      entityCode: product.code,
      summary: `Quitó las partes de color propias de ${product.name}: usa las de la categoría`,
      before: antes,
      after: [],
    });
  });

  revalidar("producto", product.id);
  return { ok: true, message: "El producto usa las partes de su categoría" };
}
