import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { sniffReceiptMime } from "@/modules/expenses/domain/receipt-check";

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
  return savePhoto(file, "shipments");
}

async function savePhoto(file: File, folder: "shipments"): Promise<{ url: string }> {
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

  return writeUpload(folder, "jpg", await toJpeg(Buffer.from(await file.arrayBuffer())));
}

// Evidencia de una devolución (foto o PDF). El tipo sale de los bytes, no del nombre ni del navegador.
// Las fotos se reducen como las de la guía; el PDF se guarda tal cual.
export async function validateReturnEvidence(file: File): Promise<{ bytes: Buffer; pdf: boolean }> {
  if (!hasUploadedFile(file)) throw new Error("No se pudo leer el archivo.");
  if (file.size > PHOTO_MAX_BYTES) throw new Error("Un archivo supera el límite de 12 MB.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const mime = sniffReceiptMime(bytes);
  if (!mime) throw new Error("Un archivo no es compatible. Usa JPG, PNG, WEBP o PDF.");
  return { bytes, pdf: mime === "application/pdf" };
}

export async function saveReturnEvidence(evidence: { bytes: Buffer; pdf: boolean }): Promise<{ url: string }> {
  if (evidence.pdf) return writeUpload("returns", "pdf", evidence.bytes);
  return writeUpload("returns", "jpg", await toJpeg(evidence.bytes));
}

async function toJpeg(input: Buffer): Promise<Buffer> {
  try {
    return await sharp(input)
      .rotate()
      .resize({ width: PHOTO_MAX_SIDE, height: PHOTO_MAX_SIDE, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
  } catch {
    throw new Error("La foto no se pudo procesar. Toma otra e intenta de nuevo.");
  }
}

async function writeUpload(folder: "shipments" | "returns", extension: "jpg" | "pdf", output: Buffer): Promise<{ url: string }> {
  const uploadDir = path.join(process.cwd(), "public", "uploads", folder);
  const fileName = `${randomUUID()}.${extension}`;
  try {
    await mkdir(uploadDir, { recursive: true });
    await writeFile(path.join(uploadDir, fileName), output);
  } catch (error) {
    // El error del disco trae la ruta del servidor: no se muestra (la página de la proveedora es pública).
    console.error("No se pudo guardar el archivo:", error);
    throw new Error(folder === "returns" ? "No se pudo guardar el archivo. Intenta de nuevo." : "No se pudo guardar la foto. Intenta de nuevo.");
  }
  return { url: `/uploads/${folder}/${fileName}` };
}
