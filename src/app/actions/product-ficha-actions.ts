"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { logActivity } from "@/lib/activity-log";
import { hasAnyModuleAccess } from "@/lib/admin-module-access";
import { FICHA_MAX_BYTES, FICHA_TIPOS_PERMITIDOS, guardarImagenFicha } from "@/lib/fichas-storage";
import { createImageVariants } from "@/lib/image-variants.server";
import { prisma } from "@/lib/prisma";
import {
  leerCsvFichas,
  leerDriveFileId,
  planearImportacionFichas,
  siguienteOrden,
  SOLO_FICHAS,
  TIPO_FICHA,
  type PlanFichas,
} from "@/lib/product-fichas";

// Fichas tecnicas (ProductImage.tipo = "ficha"). Solo quien tiene el modulo "products".
// La imagen se SUBE desde el navegador: hoy no hay forma de bajar un archivo cualquiera del Drive
// gestionmagilus (NETMAGI solo entrega fotos de carpetas emparejadas a Marketplace). El id o enlace
// de Drive se guarda como referencia (driveFileId) y sirve para no duplicar la ficha.

export type FichaActionResult = { ok: boolean; message: string; estado?: "creada" | "ya-existe" };

async function puedeEditarProductos(): Promise<boolean> {
  const session = await auth();
  return !!session?.user?.id && (await hasAnyModuleAccess(session.user.id, session.user.role, ["products"]));
}

function leerArchivo(value: FormDataEntryValue | null): File | null {
  return value instanceof File && value.size > 0 ? value : null;
}

function validarArchivo(file: File): string | null {
  if (file.size > FICHA_MAX_BYTES) return "La ficha supera 15 MB";
  if (file.type && !FICHA_TIPOS_PERMITIDOS.has(file.type)) return "Usa una imagen JPG, PNG o WEBP";
  return null;
}

// Crea la ficha si el producto no tiene ya una con ese driveFileId. Idempotente.
async function crearFicha(input: {
  productId: string;
  file: File;
  driveFileId: string | null;
  origen: string;
}): Promise<FichaActionResult> {
  if (input.driveFileId) {
    const existente = await prisma.productImage.findFirst({
      where: { productId: input.productId, driveFileId: input.driveFileId, ...SOLO_FICHAS },
      select: { id: true },
    });
    if (existente) return { ok: true, message: "Esa ficha ya estaba", estado: "ya-existe" };
  }

  let url: string;
  try {
    const guardada = await guardarImagenFicha(Buffer.from(await input.file.arrayBuffer()), {
      driveFileId: input.driveFileId,
    });
    url = guardada.url;
    await createImageVariants(guardada.filePath);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo guardar la ficha" };
  }

  const estado = await prisma.$transaction(async (tx) => {
    const filas = await tx.productImage.findMany({
      where: { productId: input.productId },
      select: { order: true, driveFileId: true, tipo: true },
    });
    if (input.driveFileId && filas.some((f) => f.tipo === TIPO_FICHA && f.driveFileId === input.driveFileId)) {
      return "ya-existe" as const;
    }
    await tx.productImage.create({
      data: {
        productId: input.productId,
        url,
        order: siguienteOrden(filas),
        tipo: TIPO_FICHA,
        driveFileId: input.driveFileId,
        origen: input.origen,
      },
    });
    return "creada" as const;
  });
  return estado === "creada"
    ? { ok: true, message: "Ficha agregada", estado }
    : { ok: true, message: "Esa ficha ya estaba", estado };
}

function revalidarProducto(productId: string, slug?: string | null, categorySlug?: string | null) {
  revalidatePath(`/admin/productos/${productId}`);
  if (slug && categorySlug) revalidatePath(`/${categorySlug}/${slug}`);
}

// Ficha desde el admin del producto: archivo (obligatorio) + enlace/id de Drive (opcional).
export async function adminAddFichaAction(formData: FormData): Promise<FichaActionResult> {
  if (!(await puedeEditarProductos())) return { ok: false, message: "No autorizado" };
  const productId = String(formData.get("productId") ?? "").trim();
  if (!productId) return { ok: false, message: "Producto invalido" };

  const file = leerArchivo(formData.get("file"));
  if (!file) return { ok: false, message: "Sube la imagen de la ficha (JPG). Desde Drive: descargala y subela aqui." };
  const invalido = validarArchivo(file);
  if (invalido) return { ok: false, message: invalido };

  const drive = leerDriveFileId(String(formData.get("drive") ?? ""));
  if (drive === "invalido") return { ok: false, message: "El enlace o id de Drive no es valido" };

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, name: true, slug: true, category: { select: { slug: true } } },
  });
  if (!product) return { ok: false, message: "El producto ya no existe" };

  const result = await crearFicha({ productId, file, driveFileId: drive, origen: drive ? "drive" : "servidor" });
  if (result.ok && result.estado === "creada") {
    await logActivity({
      action: "UPDATE",
      entityType: "PRODUCT",
      entityId: productId,
      summary: `Agrego una ficha tecnica a "${product.name}"`,
    });
    revalidarProducto(productId, product.slug, product.category?.slug);
  }
  return result;
}

// Quita la ficha (borra la fila; el archivo del disco no se borra, igual que las fotos).
// Solo borra filas tipo "ficha": nunca toca una foto de la galeria.
export async function adminRemoveFichaAction(input: { productId: string; fichaId: string }): Promise<FichaActionResult> {
  if (!(await puedeEditarProductos())) return { ok: false, message: "No autorizado" };
  const productId = typeof input?.productId === "string" ? input.productId.trim() : "";
  const fichaId = typeof input?.fichaId === "string" ? input.fichaId.trim() : "";
  if (!productId || !fichaId) return { ok: false, message: "Datos invalidos" };

  const deleted = await prisma.productImage.deleteMany({ where: { id: fichaId, productId, ...SOLO_FICHAS } });
  if (deleted.count === 0) return { ok: false, message: "La ficha ya no existe" };

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { name: true, slug: true, category: { select: { slug: true } } },
  });
  await logActivity({
    action: "UPDATE",
    entityType: "PRODUCT",
    entityId: productId,
    summary: `Quito una ficha tecnica de "${product?.name ?? productId}"`,
  });
  revalidarProducto(productId, product?.slug, product?.category?.slug);
  return { ok: true, message: "Ficha quitada" };
}

// ── Carga en lote (/admin/productos/fichas) ─────────────────────────────────

export type VistaPreviaFichas = {
  ok: boolean;
  message: string;
  errores: string[];
  plan: PlanFichas | null;
};

// Simulacion: lee el CSV y dice que haria (no escribe). `archivos` = driveFileId de las imagenes
// que eligio la persona.
export async function adminPreviewFichasAction(input: { csv: string; archivos: string[] }): Promise<VistaPreviaFichas> {
  if (!(await puedeEditarProductos())) return { ok: false, message: "No autorizado", errores: [], plan: null };
  const csv = typeof input?.csv === "string" ? input.csv : "";
  if (csv.length > 500_000) return { ok: false, message: "CSV demasiado grande", errores: [], plan: null };
  const { filas, errores } = leerCsvFichas(csv);
  if (filas.length === 0) return { ok: false, message: "El CSV no tiene filas validas", errores, plan: null };

  const codigos = [...new Set(filas.map((f) => f.codigo))];
  const productos = await prisma.product.findMany({
    where: { code: { in: codigos } },
    select: { id: true, code: true, images: { where: SOLO_FICHAS, select: { driveFileId: true } } },
  });
  const archivos = new Set(Array.isArray(input?.archivos) ? input.archivos.filter((a) => typeof a === "string") : []);
  const plan = planearImportacionFichas(
    filas,
    productos.map((p) => ({
      id: p.id,
      code: p.code,
      fichasDriveIds: p.images.map((i) => i.driveFileId).filter((id): id is string => !!id),
    })),
    archivos,
  );
  return { ok: true, message: `${filas.length} fila(s) leidas`, errores, plan };
}

// Una fila del lote (el navegador las manda de a una para no pasar el limite de 16 MB).
export async function adminImportFichaRowAction(formData: FormData): Promise<FichaActionResult> {
  if (!(await puedeEditarProductos())) return { ok: false, message: "No autorizado" };
  const codigo = String(formData.get("codigo") ?? "").trim().toUpperCase();
  const drive = leerDriveFileId(String(formData.get("driveFileId") ?? ""));
  if (!codigo) return { ok: false, message: "Falta el codigo" };
  if (!drive || drive === "invalido") return { ok: false, message: `${codigo}: driveFileId invalido` };
  const file = leerArchivo(formData.get("file"));
  if (!file) return { ok: false, message: `${codigo}: falta la imagen` };
  const invalido = validarArchivo(file);
  if (invalido) return { ok: false, message: `${codigo}: ${invalido}` };

  const product = await prisma.product.findFirst({
    where: { code: codigo },
    select: { id: true, name: true, slug: true, category: { select: { slug: true } } },
  });
  if (!product) return { ok: false, message: `${codigo}: no existe el producto` };

  const result = await crearFicha({ productId: product.id, file, driveFileId: drive, origen: "drive" });
  if (result.ok && result.estado === "creada") {
    await logActivity({
      action: "UPDATE",
      entityType: "PRODUCT",
      entityId: product.id,
      summary: `Agrego una ficha tecnica a "${product.name}" (carga en lote)`,
    });
    revalidarProducto(product.id, product.slug, product.category?.slug);
  }
  return { ...result, message: `${codigo}: ${result.message}` };
}
