"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { logActivity } from "@/lib/activity-log";
import { hasAnyModuleAccess } from "@/lib/admin-module-access";
import { planGallerySave } from "@/lib/gallery-organizer";
import { prisma } from "@/lib/prisma";
import { SOLO_FOTOS } from "@/lib/product-fichas";

export type GallerySaveResult = { ok: boolean; message: string };

const MAX_IDS = 200;

function cleanIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item.length <= 64)
    .slice(0, MAX_IDS);
}

// Organizador de fotos: guarda orden, portada y fotos quitadas en una sola transaccion.
// Conserva las filas (driveFileId / origen) y NO borra archivos del disco: hoy no existe esa
// logica en Gestion (al quitar en el formulario tampoco se borran) y un mismo archivo puede estar
// en otra fila (p. ej. drive-<id>.jpg).
export async function adminSaveProductGalleryAction(input: {
  productId: string;
  order: string[];
  removeIds: string[];
  coverId: string | null;
}): Promise<GallerySaveResult> {
  const session = await auth();
  if (!session?.user?.id || !(await hasAnyModuleAccess(session.user.id, session.user.role, ["products"]))) {
    return { ok: false, message: "No autorizado" };
  }
  const productId = typeof input?.productId === "string" ? input.productId.trim() : "";
  if (!productId) return { ok: false, message: "Producto invalido" };

  const product = await prisma.product.findUnique({
    where: { id: productId },
    // SOLO fotos: una ficha tecnica nunca entra al organizador ni puede quedar de portada.
    select: {
      id: true,
      name: true,
      thumbnailUrl: true,
      images: { where: SOLO_FOTOS, select: { id: true, url: true, order: true, origen: true, driveFileId: true } },
    },
  });
  if (!product) return { ok: false, message: "El producto ya no existe" };

  const plan = planGallerySave({
    rows: product.images,
    order: cleanIds(input.order),
    removeIds: cleanIds(input.removeIds),
    coverId: typeof input.coverId === "string" && input.coverId.trim() ? input.coverId.trim() : null,
    currentThumbnailUrl: product.thumbnailUrl,
  });
  if (!plan.ok) return { ok: false, message: plan.error };

  const coverChanged = plan.thumbnailUrl !== product.thumbnailUrl;
  if (plan.update.length === 0 && plan.remove.length === 0 && !coverChanged) {
    return { ok: true, message: "No habia cambios" };
  }

  try {
    await prisma.$transaction([
      ...(plan.remove.length > 0
        ? [prisma.productImage.deleteMany({ where: { productId, id: { in: plan.remove }, ...SOLO_FOTOS } })]
        : []),
      ...plan.update.map((item) =>
        prisma.productImage.update({ where: { id: item.id }, data: { order: item.order } }),
      ),
      ...(coverChanged
        ? [prisma.product.update({ where: { id: productId }, data: { thumbnailUrl: plan.thumbnailUrl } })]
        : []),
    ]);
  } catch {
    return { ok: false, message: "No se pudieron guardar las fotos. Intenta de nuevo." };
  }

  const parts: string[] = [];
  if (plan.update.length > 0) parts.push("reordeno");
  if (coverChanged) parts.push("cambio la portada");
  if (plan.remove.length > 0) parts.push(`quito ${plan.remove.length} foto(s)`);
  await logActivity({
    action: "UPDATE",
    entityType: "PRODUCT",
    entityId: productId,
    summary: `Organizo las fotos de "${product.name}": ${parts.join(", ")}`,
  });

  revalidatePath("/");
  revalidatePath("/admin/productos");
  revalidatePath(`/admin/productos/${productId}`);
  return { ok: true, message: "Fotos guardadas" };
}
