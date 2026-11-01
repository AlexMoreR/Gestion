// Guarda la foto o PDF del comprobante de un pago a proveedora en /uploads/suppliers/payments.
// Vive fuera de los archivos "use server" para no quedar expuesta como accion publica.
import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const RECEIPT_MAX_BYTES = 12 * 1024 * 1024;
const ALLOWED_RECEIPT_MIME = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const ALLOWED_RECEIPT_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".pdf"]);

export async function saveSupplierPaymentReceipt(file: File): Promise<{ url: string; name: string }> {
  if (!(file instanceof File) || file.size <= 0) {
    throw new Error("No se pudo leer el comprobante.");
  }
  if (file.size > RECEIPT_MAX_BYTES) {
    throw new Error("El comprobante supera el límite de 12 MB.");
  }
  const fromName = path.extname(file.name).toLowerCase();
  const extension =
    fromName ||
    (file.type === "application/pdf"
      ? ".pdf"
      : file.type === "image/png"
        ? ".png"
        : file.type === "image/webp"
          ? ".webp"
          : ".jpg");
  if (!ALLOWED_RECEIPT_MIME.has(file.type) && !ALLOWED_RECEIPT_EXT.has(extension)) {
    throw new Error("El comprobante no es compatible. Solo JPG, PNG, WEBP o PDF.");
  }

  const uploadDir = path.join(process.cwd(), "public", "uploads", "suppliers", "payments");
  await mkdir(uploadDir, { recursive: true });
  const fileName = `${Date.now()}-${randomUUID()}${extension}`;
  await writeFile(path.join(uploadDir, fileName), Buffer.from(await file.arrayBuffer()));

  return { url: `/uploads/suppliers/payments/${fileName}`, name: file.name || fileName };
}


// Borra un comprobante guardado aqui (solo dentro de /uploads/suppliers/payments).
export async function removeSupplierPaymentReceipt(url: string): Promise<void> {
  const fileName = path.basename(url);
  if (url !== `/uploads/suppliers/payments/${fileName}`) {
    return;
  }
  await rm(path.join(process.cwd(), "public", "uploads", "suppliers", "payments", fileName), { force: true });
}

// Para la ruta publica (enlace secreto): la extension la decide quien llama segun los bytes del
// archivo (sniffReceiptMime), nunca el nombre ni el tipo que manda el navegador.
export async function saveSupplierPaymentReceiptBytes(
  bytes: Uint8Array,
  name: string,
  ext: ".jpg" | ".png" | ".webp" | ".pdf",
): Promise<{ url: string; name: string }> {
  const uploadDir = path.join(process.cwd(), "public", "uploads", "suppliers", "payments");
  await mkdir(uploadDir, { recursive: true });
  const fileName = `${Date.now()}-${randomUUID()}${ext}`;
  await writeFile(path.join(uploadDir, fileName), bytes);
  return { url: `/uploads/suppliers/payments/${fileName}`, name: name.slice(0, 200) || fileName };
}
