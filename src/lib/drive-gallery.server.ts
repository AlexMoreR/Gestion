import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { createImageVariants } from "@/lib/image-variants.server";
import { getNetmagiConfig, type NetmagiConfig } from "@/lib/netmagi-config.server";
import {
  DRIVE_GALLERY_MAX,
  DRIVE_MIN_SIDE,
  DRIVE_OUTPUT_JPEG_QUALITY,
  DRIVE_OUTPUT_MAX_SIDE,
  driveUploadFileName,
  galleryCount,
  selectDrivePhotos,
  type NetmagiFoto,
} from "@/lib/drive-gallery";

// "Traer de Drive" (Fase 6, opcion A3): NETMAGI ya lee Drive y empareja las carpetas por codigo.
// Gestion le pide la lista y los archivos con la llave GESTION_FOTOS_KEY, copia las elegidas a
// uploads/products/drive-<driveId>.jpg y las agrega AL FINAL de la galeria (origen "drive").
// Nunca cambia la portada (thumbnailUrl) ni escribe en Drive.

export const NETMAGI_NOT_CONFIGURED = "Falta configurar NETMAGI";
const MAX_DOWNLOAD_BYTES = 15 * 1024 * 1024;
const LIST_TIMEOUT_MS = 30_000;
const FILE_TIMEOUT_MS = 120_000; // el Apps Script de Drive puede tardar

// La configuracion vive en netmagi-config.server.ts (la comparte el panel /admin/marketplace).
export { getNetmagiConfig };

async function fetchWithTimeout(url: string, key: string, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) throw new Error("NETMAGI no respondio a tiempo");
    throw new Error(`No se pudo conectar con NETMAGI: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timer);
  }
}

async function errorText(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (body && typeof body.error === "string") return body.error;
  } catch {
    // sin cuerpo JSON
  }
  return `HTTP ${response.status}`;
}

async function listNetmagiPhotos(config: NetmagiConfig, code: string): Promise<NetmagiFoto[]> {
  const response = await fetchWithTimeout(
    `${config.baseUrl}/gestion/fotos?code=${encodeURIComponent(code)}`,
    config.key,
    LIST_TIMEOUT_MS,
  );
  if (response.status === 401) throw new Error("NETMAGI rechazo la llave (revisa GESTION_FOTOS_KEY en los dos servicios)");
  if (response.status === 503) throw new Error("NETMAGI no tiene configurada GESTION_FOTOS_KEY");
  if (!response.ok) throw new Error(`NETMAGI: ${await errorText(response)}`);
  const body = (await response.json()) as { ok?: boolean; fotos?: NetmagiFoto[]; error?: string };
  if (!body?.ok || !Array.isArray(body.fotos)) throw new Error(`NETMAGI: ${body?.error ?? "respuesta invalida"}`);
  return body.fotos;
}

async function downloadNetmagiPhoto(config: NetmagiConfig, code: string, driveFileId: string): Promise<Buffer> {
  const response = await fetchWithTimeout(
    `${config.baseUrl}/gestion/fotos/${encodeURIComponent(driveFileId)}/archivo?code=${encodeURIComponent(code)}`,
    config.key,
    FILE_TIMEOUT_MS,
  );
  if (!response.ok) throw new Error(await errorText(response));
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > MAX_DOWNLOAD_BYTES) throw new Error("foto demasiado grande");
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0) throw new Error("archivo vacio");
  if (buffer.length > MAX_DOWNLOAD_BYTES) throw new Error("foto demasiado grande");
  return buffer;
}

// Rota segun EXIF, reduce a max. 2000 px y guarda JPG. Devuelve la ruta publica.
async function saveDrivePhoto(buffer: Buffer, driveFileId: string): Promise<string> {
  const image = sharp(buffer, { failOn: "error" }).rotate();
  const meta = await sharp(buffer).metadata();
  const side = Math.max(meta.width ?? 0, meta.height ?? 0);
  if (!side) throw new Error("no es una imagen valida");
  if (side < DRIVE_MIN_SIDE) throw new Error(`muy pequena (${side} px; minimo ${DRIVE_MIN_SIDE})`);

  const output = await image
    .resize({ width: DRIVE_OUTPUT_MAX_SIDE, height: DRIVE_OUTPUT_MAX_SIDE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: DRIVE_OUTPUT_JPEG_QUALITY, mozjpeg: true })
    .toBuffer();

  const fileName = driveUploadFileName(driveFileId);
  const uploadDir = path.join(process.cwd(), "public", "uploads", "products");
  await mkdir(uploadDir, { recursive: true });
  const filePath = path.join(uploadDir, fileName);
  const tempPath = `${filePath}.${randomUUID()}.tmp`;
  try {
    await writeFile(tempPath, output);
    await rename(tempPath, filePath);
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    throw error;
  }
  await createImageVariants(filePath);
  return `/uploads/products/${fileName}`;
}

export type DriveImportResult = {
  productId: string;
  code: string;
  ok: boolean;
  added: number;
  alreadyInProduct: number;
  failed: number;
  message: string;
  errors: string[];
};

function summarize(result: Omit<DriveImportResult, "message">, extra = ""): DriveImportResult {
  const parts = [`${result.code}: ${result.added} traida(s)`];
  if (result.alreadyInProduct) parts.push(`${result.alreadyInProduct} ya estaban`);
  if (result.failed) parts.push(`${result.failed} fallaron`);
  if (extra) parts.push(extra);
  return { ...result, message: parts.join(", ") };
}

export async function importDrivePhotosForProduct(productId: string): Promise<DriveImportResult> {
  const base = { productId, code: "", ok: false, added: 0, alreadyInProduct: 0, failed: 0, errors: [] as string[] };
  const config = getNetmagiConfig();
  if (!config) return { ...base, message: NETMAGI_NOT_CONFIGURED };

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, code: true, thumbnailUrl: true, images: { select: { url: true, driveFileId: true } } },
  });
  if (!product) return { ...base, message: "Producto no encontrado" };
  const code = (product.code ?? "").trim().toUpperCase();
  if (!code) return { ...base, message: "El producto no tiene codigo" };
  base.code = code;

  let fotos: NetmagiFoto[];
  try {
    fotos = await listNetmagiPhotos(config, code);
  } catch (error) {
    return { ...base, message: `${code}: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (fotos.length === 0) return summarize({ ...base, ok: true }, "sin carpeta en Drive");

  const existingDriveIds = product.images.map((image) => image.driveFileId).filter((id): id is string => !!id);
  const currentCount = galleryCount(product.thumbnailUrl, product.images.map((image) => image.url));
  const selection = selectDrivePhotos({ fotos, existingDriveFileIds: existingDriveIds, currentCount });
  base.alreadyInProduct = selection.alreadyInProduct;
  if (selection.slots === 0) return summarize({ ...base, ok: true }, `la galeria ya tiene ${DRIVE_GALLERY_MAX} fotos`);
  if (selection.selected.length === 0) {
    return summarize({ ...base, ok: true }, selection.tooSmall ? `${selection.tooSmall} muy pequenas` : "nada nuevo");
  }

  // Una por una: el Apps Script de Drive tiene cuotas.
  for (const foto of selection.selected) {
    const driveFileId = foto.drive_id;
    try {
      const buffer = await downloadNetmagiPhoto(config, code, driveFileId);
      const url = await saveDrivePhoto(buffer, driveFileId);
      const created = await prisma.$transaction(async (tx) => {
        const current = await tx.product.findUnique({
          where: { id: productId },
          select: { thumbnailUrl: true, images: { select: { url: true, order: true, driveFileId: true } } },
        });
        if (!current) return "gone" as const;
        if (current.images.some((image) => image.driveFileId === driveFileId)) return "exists" as const;
        if (galleryCount(current.thumbnailUrl, current.images.map((image) => image.url)) >= DRIVE_GALLERY_MAX) {
          return "full" as const;
        }
        const nextOrder = current.images.reduce((maxOrder, image) => Math.max(maxOrder, image.order), -1) + 1;
        await tx.productImage.create({
          data: { productId, url, order: nextOrder, driveFileId, origen: "drive" },
        });
        return "created" as const;
      });
      if (created === "created") base.added += 1;
      else if (created === "exists") base.alreadyInProduct += 1;
      else break; // producto borrado o galeria llena
    } catch (error) {
      base.failed += 1;
      base.errors.push(`${foto.nombre || driveFileId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return summarize({ ...base, ok: base.failed === 0 || base.added > 0 });
}
