"use server";

import { unlink } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { getActivityActor, logActivityTx } from "@/lib/activity-log";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { claveColorCombo, etiquetaColorCombo, type ColoresDeLinea } from "@/lib/combo-foto-color";
import { prisma } from "@/lib/prisma";
import { resolverPartes } from "@/lib/product-parts";
import { hasUploadedFile, saveComboColorPhoto } from "@/lib/upload-photo";
import { esComboCamillas } from "@/modules/ventas/domain/combo-camillas";

// Foto por color del combo camilla (nov-2026). Solo ADMIN con permiso de Productos. No crea OF ni manda nada.

export type FotoColorResult = { ok: boolean; message: string };

const CARPETA = "/uploads/combo-colores/";

async function adminDeProductos(): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") return false;
  return hasAdminModuleAccess(session.user.id, session.user.role, "products");
}

const colorTexto = z.string().trim().max(80, "El color va hasta 80 letras");
const coloresSchema = z.object({
  color: colorTexto.default(""),
  partes: z.array(z.object({ parte: z.string().trim().min(1).max(40), color: colorTexto })).max(10).default([]),
});

/** Borra del disco una foto vieja de esta carpeta; si falla no pasa nada (la fila ya cambió). */
async function borrarArchivo(url: string) {
  if (!url.startsWith(CARPETA)) return;
  const nombre = path.basename(url);
  await unlink(path.join(process.cwd(), "public", "uploads", "combo-colores", nombre)).catch(() => undefined);
}

/**
 * Sube la foto de una variante nueva (partes elegidas o un solo color) o, con `id`, cambia la foto de una
 * variante que ya existe (sus colores no cambian).
 */
export async function guardarFotoColorComboAction(formData: FormData): Promise<FotoColorResult> {
  if (!(await adminDeProductos())) return { ok: false, message: "Solo un administrador con permiso de Productos puede subir fotos" };

  const productId = z.string().trim().min(1).max(60).safeParse(formData.get("productId"));
  if (!productId.success) return { ok: false, message: "Producto inválido" };
  const idRaw = formData.get("id");
  const id = idRaw ? z.string().trim().min(1).max(60).safeParse(idRaw) : null;
  if (id && !id.success) return { ok: false, message: "Foto inválida" };
  const foto = formData.get("foto");
  if (!hasUploadedFile(foto)) return { ok: false, message: "Elige una foto" };

  const parteSelect = { orderBy: { orden: "asc" as const }, select: { nombre: true, orden: true } };
  const product = await prisma.product.findUnique({
    where: { id: productId.data },
    select: { id: true, name: true, code: true, partesColor: parteSelect, category: { select: { partesColor: parteSelect } } },
  });
  if (!product) return { ok: false, message: "El producto no existe" };
  if (!esComboCamillas({ codigo: product.code })) return { ok: false, message: "Las fotos por color son solo del combo camilla" };

  let clave: string;
  let etiqueta: string;
  if (id?.success) {
    const fila = await prisma.comboFotoColor.findUnique({ where: { id: id.data }, select: { productId: true, claveColor: true, etiqueta: true } });
    if (!fila || fila.productId !== product.id) return { ok: false, message: "Esa foto ya no existe" };
    clave = fila.claveColor;
    etiqueta = fila.etiqueta;
  } else {
    let colores: z.infer<typeof coloresSchema>;
    try {
      const parsed = coloresSchema.safeParse(JSON.parse(String(formData.get("colores") ?? "{}")));
      if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Colores inválidos" };
      colores = parsed.data;
    } catch {
      return { ok: false, message: "Colores inválidos" };
    }
    // Con partes, se toma exactamente una por cada parte del combo (como en la cotización).
    const partes = resolverPartes(product.category?.partesColor ?? [], product.partesColor);
    const linea: ColoresDeLinea =
      partes.length > 0
        ? {
            color: "",
            partes: partes.map((parte) => ({
              parte: parte.nombre,
              color: colores.partes.find((p) => p.parte === parte.nombre)?.color ?? "",
            })),
          }
        : { color: colores.color, partes: [] };
    const calculada = claveColorCombo([linea]);
    if (!calculada) return { ok: false, message: partes.length > 0 ? "Elige el color de cada parte" : "Elige o escribe el color" };
    clave = calculada;
    etiqueta = etiquetaColorCombo(linea);
  }

  let fotoUrl: string;
  try {
    fotoUrl = (await saveComboColorPhoto(foto)).url;
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo guardar la foto" };
  }

  const actor = await getActivityActor();
  const antes = await prisma.$transaction(async (tx) => {
    const where = { productId_claveColor: { productId: product.id, claveColor: clave } };
    const previa = await tx.comboFotoColor.findUnique({ where, select: { etiqueta: true, fotoUrl: true } });
    await tx.comboFotoColor.upsert({
      where,
      create: { productId: product.id, claveColor: clave, etiqueta, fotoUrl, actualizadoPorId: actor.id },
      update: { etiqueta, fotoUrl, actualizadoPorId: actor.id },
    });
    await logActivityTx(tx, actor, {
      action: previa ? "UPDATE" : "CREATE",
      entityType: "PRODUCT",
      entityId: product.id,
      entityCode: product.code,
      summary: `${previa ? "Cambió" : "Subió"} la foto del color «${etiqueta}» de ${product.name}`,
      before: previa,
      after: { claveColor: clave, etiqueta, fotoUrl },
    });
    return previa;
  });
  if (antes) await borrarArchivo(antes.fotoUrl);

  revalidatePath(`/admin/productos/${product.id}/fotos-color`);
  return { ok: true, message: antes ? "Foto cambiada" : "Foto guardada" };
}

/** Quita la foto de una variante (no es dinero: se borra y queda en la bitácora). */
export async function quitarFotoColorComboAction(id: unknown): Promise<FotoColorResult> {
  if (!(await adminDeProductos())) return { ok: false, message: "Solo un administrador con permiso de Productos puede quitar fotos" };
  const parsed = z.string().trim().min(1).max(60).safeParse(id);
  if (!parsed.success) return { ok: false, message: "Foto inválida" };

  const fila = await prisma.comboFotoColor.findUnique({
    where: { id: parsed.data },
    select: { id: true, productId: true, claveColor: true, etiqueta: true, fotoUrl: true, product: { select: { name: true, code: true } } },
  });
  if (!fila) return { ok: false, message: "Esa foto ya no existe" };

  const actor = await getActivityActor();
  await prisma.$transaction(async (tx) => {
    await tx.comboFotoColor.delete({ where: { id: fila.id } });
    await logActivityTx(tx, actor, {
      action: "DELETE",
      entityType: "PRODUCT",
      entityId: fila.productId,
      entityCode: fila.product.code,
      summary: `Quitó la foto del color «${fila.etiqueta}» de ${fila.product.name}`,
      before: { claveColor: fila.claveColor, etiqueta: fila.etiqueta, fotoUrl: fila.fotoUrl },
      after: null,
    });
  });
  await borrarArchivo(fila.fotoUrl);

  revalidatePath(`/admin/productos/${fila.productId}/fotos-color`);
  return { ok: true, message: "Foto quitada" };
}
