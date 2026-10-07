import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

// Foto de una guia Magilus (entrega o novedad). Mismo limite y formatos que las fotos de
// despacho (saveTrackingPhoto / saveDeliveryPhoto en dispatch-actions.ts), pero mas estricto:
// exige tipo de imagen valido Y extension valida (si el archivo trae extension), la decodifica
// con sharp (si no es imagen, falla) y la reduce a 1600 px en JPG para que pese poco.
// Nombre 100 % aleatorio (sin ids de orden ni de cliente).

const PHOTO_MAX_BYTES = 12 * 1024 * 1024;
const PHOTO_MAX_SIDE = 1600;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"]);

export function hasUploadedFile(value: FormDataEntryValue | null): value is File {
  return value instanceof File && value.size > 0;
}

export async function saveShipmentPhoto(file: File): Promise<{ url: string }> {
  if (!hasUploadedFile(file)) {
    throw new Error("No se pudo leer la foto.");
  }
  if (file.size > PHOTO_MAX_BYTES) {
    throw new Error("La foto supera el límite de 12 MB.");
  }
  const extension = path.extname(file.name || "").toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(file.type) || (extension && !ALLOWED_EXTENSIONS.has(extension))) {
    throw new Error("La foto no es compatible. Usa JPG, PNG o WEBP.");
  }

  const input = Buffer.from(await file.arrayBuffer());
  let output: Buffer;
  try {
    output = await sharp(input)
      .rotate()
      .resize({ width: PHOTO_MAX_SIDE, height: PHOTO_MAX_SIDE, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
  } catch {
    throw new Error("La foto no se pudo procesar. Toma otra e intenta de nuevo.");
  }

  const uploadDir = path.join(process.cwd(), "public", "uploads", "shipments");
  await mkdir(uploadDir, { recursive: true });
  const fileName = `${randomUUID()}.jpg`;
  await writeFile(path.join(uploadDir, fileName), output);
  return { url: `/uploads/shipments/${fileName}` };
}
