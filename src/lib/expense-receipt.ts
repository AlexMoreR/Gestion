import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

// Comprobantes de gastos (incluye pagos de nomina): se guardan en public/uploads/expenses.
const RECEIPT_MAX_BYTES = 12 * 1024 * 1024;
const ALLOWED_RECEIPT_MIME = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const ALLOWED_RECEIPT_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".pdf"]);

// Guarda el comprobante y devuelve su ruta publica.
export async function saveExpenseReceipt(file: File): Promise<{ url: string; name: string }> {
  if (file.size > RECEIPT_MAX_BYTES) {
    throw new Error("El comprobante supera el limite de 12 MB.");
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

  const uploadDir = path.join(process.cwd(), "public", "uploads", "expenses");
  await mkdir(uploadDir, { recursive: true });
  const fileName = `${Date.now()}-${randomUUID()}${extension}`;
  await writeFile(path.join(uploadDir, fileName), Buffer.from(await file.arrayBuffer()));

  return { url: `/uploads/expenses/${fileName}`, name: file.name || fileName };
}

// Guarda un comprobante que llega como bytes (p. ej. la foto subida por el enlace de un gasto
// dicho a Claude). Mismo limite y mismos formatos que saveExpenseReceipt.
export async function saveExpenseReceiptBytes(
  bytes: Uint8Array,
  originalName: string,
  extension: string,
): Promise<{ url: string; name: string }> {
  if (bytes.length > RECEIPT_MAX_BYTES) {
    throw new Error("El comprobante supera el limite de 12 MB.");
  }
  if (!ALLOWED_RECEIPT_EXT.has(extension)) {
    throw new Error("El comprobante no es compatible. Solo JPG, PNG, WEBP o PDF.");
  }
  const uploadDir = path.join(process.cwd(), "public", "uploads", "expenses");
  await mkdir(uploadDir, { recursive: true });
  const fileName = `${Date.now()}-${randomUUID()}${extension}`;
  await writeFile(path.join(uploadDir, fileName), bytes);
  return { url: `/uploads/expenses/${fileName}`, name: originalName.slice(0, 120) || fileName };
}

// Borra un comprobante recien guardado (cuando el gasto no llego a crearse). Solo dentro de uploads/expenses.
export async function removeExpenseReceipt(url: string): Promise<void> {
  const fileName = path.basename(url);
  if (url !== `/uploads/expenses/${fileName}`) {
    return;
  }
  await rm(path.join(process.cwd(), "public", "uploads", "expenses", fileName), { force: true });
}

// Lee el archivo de comprobante del formulario (vacio = no se subio nada).
export function getReceiptFile(formData: FormData, field = "receipt"): File | null {
  const file = formData.get(field);
  return file instanceof File && file.size > 0 ? file : null;
}
