// Reglas puras de la foto del soporte de un gasto dicho por voz/chat. La foto es opcional y no se
// revisa: solo se comprueba que sea un archivo permitido (JPG, PNG, WEBP o PDF) y que no pese de mas.

export type ReceiptAccountType = "CASH" | "BANK" | "WALLET" | "OTHER";

export function formatCop(value: number): string {
  return `$${Math.round(value).toLocaleString("es-CO")}`;
}

export const RECEIPT_MAX_BYTES = 12 * 1024 * 1024;

export type ReceiptMime = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

export const RECEIPT_MIME_EXTENSION: Record<ReceiptMime, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
};

// Tipo real del archivo segun sus primeros bytes (no se confia en el nombre ni en lo que diga el navegador).
export function sniffReceiptMime(bytes: Uint8Array): ReceiptMime | null {
  const startsWith = (...signature: number[]) => signature.every((value, index) => bytes[index] === value);
  if (startsWith(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (startsWith(0x89, 0x50, 0x4e, 0x47)) return "image/png";
  if (startsWith(0x25, 0x50, 0x44, 0x46)) return "application/pdf";
  if (startsWith(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return "image/webp";
  }
  return null;
}
