// Guarda la imagen de una ficha tecnica en el mismo lugar que las fotos de producto:
// public/uploads/products (en produccion es el volumen magilus_uploads, montado en /app/public/uploads).
//
// Sin "server-only" a proposito: tambien lo usa scripts/importar-fichas.ts. Solo debe importarse
// desde el servidor (server actions) o desde scripts; usa fs y sharp.
// A diferencia de "Traer de Drive", NO hay minimo de 800 px: una ficha puede ser pequena.

import { randomUUID } from "node:crypto";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

import { nombreArchivoFicha } from "./product-fichas";

export const FICHA_MAX_BYTES = 15 * 1024 * 1024;
export const FICHA_MAX_SIDE = 2400; // una ficha tiene texto: se deja mas resolucion que una foto
export const FICHA_JPEG_QUALITY = 88;
export const FICHA_TIPOS_PERMITIDOS = new Set(["image/jpeg", "image/png", "image/webp"]);

export function carpetaUploadsPorDefecto(): string {
  return path.join(process.cwd(), "public", "uploads");
}

// Devuelve { url, filePath }. url es la ruta publica (/uploads/products/ficha-....jpg).
export async function guardarImagenFicha(
  buffer: Buffer,
  opciones: { driveFileId: string | null; uploadsRoot?: string },
): Promise<{ url: string; filePath: string }> {
  if (buffer.length === 0) throw new Error("archivo vacio");
  if (buffer.length > FICHA_MAX_BYTES) throw new Error("la ficha supera 15 MB");

  let output: Buffer;
  try {
    const meta = await sharp(buffer).metadata();
    if (!meta.width || !meta.height) throw new Error("sin medidas");
    output = await sharp(buffer, { failOn: "error" })
      .rotate()
      .resize({ width: FICHA_MAX_SIDE, height: FICHA_MAX_SIDE, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" }) // PNG con transparencia -> fondo blanco
      .jpeg({ quality: FICHA_JPEG_QUALITY, mozjpeg: true })
      .toBuffer();
  } catch {
    throw new Error("no es una imagen valida (usa JPG, PNG o WEBP)");
  }

  const fileName = nombreArchivoFicha(opciones.driveFileId, randomUUID());
  const uploadDir = path.join(opciones.uploadsRoot ?? carpetaUploadsPorDefecto(), "products");
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
  return { url: `/uploads/products/${fileName}`, filePath };
}
