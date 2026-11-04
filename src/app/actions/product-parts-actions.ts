"use server";

import { randomUUID } from "node:crypto";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { getActivityActor, logActivityTx } from "@/lib/activity-log";
import { prisma } from "@/lib/prisma";
import { conservarMascaras, MASCARA_MAX_BYTES, medidaLienzo, validarMascara } from "@/lib/mascara-parte";
import { limpiarLista, resolverPartes } from "@/lib/product-parts";
import { leerImagen, medidasVisibles } from "@/lib/recolor-image.server";
import { separarImagenes } from "@/lib/product-fichas";

// Partes de color (nov-2026): plantilla de la categoría o partes propias del producto.
// Solo ADMIN. Guardar reemplaza toda la lista de una vez; cada guardado queda en la bitácora.

export type PartesColorResult = { ok: boolean; message: string };

const MAX_PARTES = 10;

const listaSchema = z.array(z.string().max(60, "Máximo 60 letras por material o acabado")).max(30, "Máximo 30 opciones");

// Recargo por opción (solo aviso en la cotización): pesos enteros, vacío o 0 = sin recargo.
const recargoSchema = z.record(
  z.string().max(60),
  z.number().int("El recargo va en pesos enteros").min(0, "El recargo no puede ser negativo").max(100_000_000, "Recargo fuera de rango"),
);

/** Solo los recargos de opciones que siguen en la lista; sin ceros. */
function recargosDe(lista: string[], tabla: Record<string, number> | undefined): Record<string, number> | undefined {
  const filas = lista.flatMap((opcion) => {
    const valor = Object.entries(tabla ?? {}).find(([llave]) => llave.trim().toLowerCase() === opcion.toLowerCase())?.[1];
    return valor && valor > 0 ? [[opcion, valor] as const] : [];
  });
  return filas.length > 0 ? Object.fromEntries(filas) : undefined;
}

// Color exacto de cada acabado (#RRGGBB) para la vista previa; vacío = color de fábrica.
const acabadosHexSchema = z.record(z.string().max(60), z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/, "El color de un acabado va como #RRGGBB"));

/** Solo los colores de acabados que siguen en la lista, en mayúsculas. */
function hexDe(lista: string[], tabla: Record<string, string> | undefined): Record<string, string> | undefined {
  const filas = lista.flatMap((opcion) => {
    const valor = Object.entries(tabla ?? {}).find(([llave]) => llave.trim().toLowerCase() === opcion.toLowerCase())?.[1];
    return valor ? [[opcion, valor.toUpperCase()] as const] : [];
  });
  return filas.length > 0 ? Object.fromEntries(filas) : undefined;
}

const parteSchema = z
  .object({
    nombre: z.string().trim().min(1, "Cada parte necesita un nombre").max(40, "El nombre va hasta 40 letras"),
    tipo: z.enum(["CARTA", "ACABADOS"]),
    materiales: listaSchema,
    acabados: listaSchema,
    recargos: z.object({ materiales: recargoSchema.optional(), acabados: recargoSchema.optional() }).optional(),
    coloresComunes: listaSchema.optional().default([]),
    acabadosHex: acabadosHexSchema.optional(),
  })
  .transform((parte) => {
    // Solo se guarda la lista que usa el tipo.
    const materiales = parte.tipo === "CARTA" ? limpiarLista(parte.materiales) : [];
    const acabados = parte.tipo === "ACABADOS" ? limpiarLista(parte.acabados) : [];
    const recargoMateriales = recargosDe(materiales, parte.recargos?.materiales);
    const recargoAcabados = recargosDe(acabados, parte.recargos?.acabados);
    const recargos =
      recargoMateriales || recargoAcabados
        ? { ...(recargoMateriales ? { materiales: recargoMateriales } : {}), ...(recargoAcabados ? { acabados: recargoAcabados } : {}) }
        : null;
    return {
      nombre: parte.nombre,
      tipo: parte.tipo,
      materiales,
      acabados,
      recargos,
      coloresComunes: parte.tipo === "CARTA" ? limpiarLista(parte.coloresComunes) : [],
      acabadosHex: hexDe(acabados, parte.acabadosHex) ?? null,
    };
  })
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
      select: { nombre: true, tipo: true, materiales: true, acabados: true, recargos: true, coloresComunes: true, acabadosHex: true, mascaraUrl: true },
    });
    await tx.parteColor.deleteMany({ where });
    if (partes.length > 0) {
      // Cada parte que sigue con el mismo nombre conserva su máscara.
      await tx.parteColor.createMany({
        data: conservarMascaras(antes, partes).map((parte, orden) => ({
          ...where,
          ...parte,
          recargos: parte.recargos ?? Prisma.DbNull,
          acabadosHex: parte.acabadosHex ?? Prisma.DbNull,
          orden,
        })),
      });
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

export type GuardarMascaraResult = PartesColorResult & { mascaraUrl?: string };

const mascaraSchema = z.object({
  productId: z.string().trim().min(1).max(60),
  parte: z.string().trim().min(1).max(40),
});

/** Guarda en disco el PNG en blanco y negro (public/uploads/mascaras, como las fichas) y devuelve su URL. */
async function escribirMascara(bytes: Buffer): Promise<{ url: string; filePath: string }> {
  const carpeta = path.join(process.cwd(), "public", "uploads", "mascaras");
  await mkdir(carpeta, { recursive: true });
  const nombre = `mascara-${randomUUID()}.png`;
  const filePath = path.join(carpeta, nombre);
  const temporal = `${filePath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporal, bytes);
    await rename(temporal, filePath);
  } catch (error) {
    await unlink(temporal).catch(() => undefined);
    throw error;
  }
  return { url: `/uploads/mascaras/${nombre}`, filePath };
}

/**
 * Máscara de una parte (PNG del tamaño del lienzo de la portada; blanco = la parte). Si el producto usa
 * las partes de su categoría, primero se copian como partes propias.
 */
export async function guardarMascaraParteAction(formData: FormData): Promise<GuardarMascaraResult> {
  if (!(await esAdmin())) return { ok: false, message: "Solo un administrador puede guardar máscaras" };
  const parsed = mascaraSchema.safeParse({ productId: formData.get("productId"), parte: formData.get("parte") });
  if (!parsed.success) return { ok: false, message: "Datos inválidos" };
  const archivo = formData.get("mascara");
  if (!(archivo instanceof File)) return { ok: false, message: "Falta la máscara" };
  if (archivo.size > MASCARA_MAX_BYTES) return { ok: false, message: "La máscara pesa más de 8 MB" };
  const { productId, parte: nombreParte } = parsed.data;

  const partesSelect = {
    orderBy: { orden: "asc" as const },
    select: { id: true, nombre: true, tipo: true, materiales: true, acabados: true, recargos: true, coloresComunes: true, acabadosHex: true, mascaraUrl: true, orden: true },
  };
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      name: true,
      code: true,
      images: { orderBy: { order: "asc" }, select: { url: true, tipo: true, order: true } },
      partesColor: partesSelect,
      category: { select: { partesColor: partesSelect } },
    },
  });
  if (!product) return { ok: false, message: "El producto no existe" };
  const portada = separarImagenes(product.images).fotos[0];
  if (!portada) return { ok: false, message: "Este producto no tiene foto de portada" };

  const bytes = Buffer.from(await archivo.arrayBuffer());
  let blancoYNegro: Buffer;
  try {
    const medidas = await medidasVisibles(await leerImagen(portada.url));
    if (!medidas) return { ok: false, message: "No se pudo leer la foto de portada" };
    const meta = await sharp(bytes).metadata().catch(() => null);
    const error = validarMascara({ bytes, ancho: meta?.width, alto: meta?.height, lienzo: medidaLienzo(medidas.ancho, medidas.alto) });
    if (error) return { ok: false, message: error };
    blancoYNegro = await sharp(bytes).flatten({ background: "#000000" }).greyscale().threshold(128).png().toBuffer();
  } catch {
    return { ok: false, message: "No se pudo leer la foto de portada o la máscara" };
  }

  const partes = resolverPartes(product.category?.partesColor ?? [], product.partesColor);
  if (!partes.some((parte) => parte.nombre === nombreParte)) return { ok: false, message: "Esa parte ya no existe; recarga la página" };

  const { url, filePath } = await escribirMascara(blancoYNegro);
  const actor = await getActivityActor();
  try {
    await prisma.$transaction(async (tx) => {
      let propias = await tx.parteColor.findMany({ where: { productId }, select: { id: true, nombre: true, mascaraUrl: true } });
      const copio = propias.length === 0;
      if (copio) {
        // Usaba las de la categoría: se copian como propias (desde aquí no sigue los cambios de la categoría).
        await tx.parteColor.createMany({
          data: (product.category?.partesColor ?? []).map((parte) => ({
            productId,
            nombre: parte.nombre,
            tipo: parte.tipo,
            materiales: parte.materiales,
            acabados: parte.acabados,
            recargos: parte.recargos ?? Prisma.DbNull,
            acabadosHex: parte.acabadosHex ?? Prisma.DbNull,
            coloresComunes: parte.coloresComunes,
            orden: parte.orden,
          })),
        });
        propias = await tx.parteColor.findMany({ where: { productId }, select: { id: true, nombre: true, mascaraUrl: true } });
      }
      const parte = propias.find((fila) => fila.nombre === nombreParte);
      if (!parte) throw new Error("PARTE_NO_EXISTE");
      await tx.parteColor.update({ where: { id: parte.id }, data: { mascaraUrl: url } });
      await logActivityTx(tx, actor, {
        action: "UPDATE",
        entityType: "PRODUCT",
        entityId: product.id,
        entityCode: product.code,
        summary: `Guardó la máscara de ${parte.nombre} de ${product.code ?? product.name}${copio ? " (copió las partes de la categoría como propias)" : ""}`,
        before: { parte: parte.nombre, mascaraUrl: parte.mascaraUrl },
        after: { parte: parte.nombre, mascaraUrl: url },
      });
    });
  } catch (error) {
    await unlink(filePath).catch(() => undefined);
    if (error instanceof Error && error.message === "PARTE_NO_EXISTE") return { ok: false, message: "Esa parte ya no existe; recarga la página" };
    throw error;
  }

  revalidatePath(`/admin/productos/${product.id}`);
  revalidatePath(`/admin/productos/${product.id}/mascaras`);
  return { ok: true, message: `Máscara de ${nombreParte} guardada`, mascaraUrl: url };
}
