"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { logActivity } from "@/lib/activity-log";
import { hasAnyModuleAccess } from "@/lib/admin-module-access";
import { parseProductCodes } from "@/lib/drive-gallery";
import {
  getNetmagiConfig,
  importDrivePhotosForProduct,
  NETMAGI_NOT_CONFIGURED,
  type DriveImportResult,
} from "@/lib/drive-gallery.server";
import { prisma } from "@/lib/prisma";

// Codigos por tanda: cada foto pasa por el Apps Script de Drive (unos segundos cada una).
const MAX_CODES_PER_RUN = 10;

export type DriveImportActionState = {
  ok: boolean;
  message: string;
  results: DriveImportResult[];
};

async function canManageProducts(): Promise<boolean> {
  const session = await auth();
  return !!session?.user?.id && (await hasAnyModuleAccess(session.user.id, session.user.role, ["products"]));
}

async function afterImport(results: DriveImportResult[]): Promise<void> {
  const added = results.filter((result) => result.added > 0);
  for (const result of added) {
    await logActivity({
      action: "UPDATE",
      entityType: "PRODUCT",
      entityId: result.productId,
      summary: `Trajo ${result.added} foto(s) de Drive (${result.code})`,
    });
  }
  if (added.length > 0) {
    revalidatePath("/");
    revalidatePath("/admin/productos");
    for (const result of added) revalidatePath(`/admin/productos/${result.productId}`);
  }
}

export async function adminImportDrivePhotosAction(productId: string): Promise<DriveImportActionState> {
  if (!(await canManageProducts())) return { ok: false, message: "No autorizado", results: [] };
  if (!getNetmagiConfig()) return { ok: false, message: NETMAGI_NOT_CONFIGURED, results: [] };
  const id = typeof productId === "string" ? productId.trim() : "";
  if (!id) return { ok: false, message: "Producto invalido", results: [] };

  const result = await importDrivePhotosForProduct(id);
  await afterImport([result]);
  return { ok: result.ok, message: result.message, results: [result] };
}

export async function adminImportDrivePhotosByCodesAction(rawCodes: string): Promise<DriveImportActionState> {
  if (!(await canManageProducts())) return { ok: false, message: "No autorizado", results: [] };
  if (!getNetmagiConfig()) return { ok: false, message: NETMAGI_NOT_CONFIGURED, results: [] };

  const codes = parseProductCodes(typeof rawCodes === "string" ? rawCodes : "");
  if (codes.length === 0) return { ok: false, message: "Escribe al menos un codigo", results: [] };
  if (codes.length > MAX_CODES_PER_RUN) {
    return { ok: false, message: `Maximo ${MAX_CODES_PER_RUN} codigos por tanda`, results: [] };
  }

  const products = await prisma.product.findMany({
    where: { code: { in: codes } },
    select: { id: true, code: true },
  });
  const byCode = new Map(products.map((product) => [(product.code ?? "").toUpperCase(), product.id]));

  const results: DriveImportResult[] = [];
  const missing: string[] = [];
  for (const code of codes) {
    const productId = byCode.get(code);
    if (!productId) {
      missing.push(code);
      continue;
    }
    results.push(await importDrivePhotosForProduct(productId));
  }
  await afterImport(results);

  const added = results.reduce((sum, result) => sum + result.added, 0);
  const failed = results.reduce((sum, result) => sum + result.failed, 0);
  const parts = [`${added} foto(s) traidas en ${results.length} producto(s)`];
  if (failed) parts.push(`${failed} fallaron`);
  if (missing.length) parts.push(`sin producto en Gestion: ${missing.join(", ")}`);
  return { ok: results.some((result) => result.ok), message: parts.join(" · "), results };
}
