// Reglas puras para aceptar o rechazar la foto del soporte de un gasto dicho por voz/chat.
// La IA solo describe la foto (que es y que monto se lee); la decision se toma aqui.

export type ReceiptKind =
  | "TRANSFERENCIA"
  | "NEQUI_DAVIPLATA"
  | "FACTURA"
  | "RECIBO"
  | "RECIBO_FIRMADO"
  | "DINERO_EFECTIVO"
  | "OTRO";

export const RECEIPT_KINDS: readonly ReceiptKind[] = [
  "TRANSFERENCIA",
  "NEQUI_DAVIPLATA",
  "FACTURA",
  "RECIBO",
  "RECIBO_FIRMADO",
  "DINERO_EFECTIVO",
  "OTRO",
];

export const RECEIPT_KIND_LABELS: Record<ReceiptKind, string> = {
  TRANSFERENCIA: "transferencia",
  NEQUI_DAVIPLATA: "pago por Nequi o Daviplata",
  FACTURA: "factura",
  RECIBO: "recibo",
  RECIBO_FIRMADO: "recibo firmado",
  DINERO_EFECTIVO: "dinero en efectivo",
  OTRO: "otra cosa",
};

// Lo que la IA vio en la foto.
export type ReceiptReview = {
  kind: ReceiptKind;
  // Monto que se lee en la foto (en el dinero en efectivo: lo que suman los billetes y monedas).
  readAmount: number | null;
  note?: string | null;
};

export type ReceiptAccountType = "CASH" | "BANK" | "WALLET" | "OTHER";

// Diferencia maxima aceptada entre el monto leido y el del gasto (redondeo).
export const RECEIPT_AMOUNT_TOLERANCE = 1;

// Solo se aceptan en cuentas de efectivo (Caja).
const CASH_ONLY_KINDS: readonly ReceiptKind[] = ["DINERO_EFECTIVO", "RECIBO_FIRMADO"];

export function formatCop(value: number): string {
  return `$${Math.round(value).toLocaleString("es-CO")}`;
}

// Convierte "$350.000", "350000", "350.000,50" o "350,000" en numero. null si no es un monto.
export function parseCopAmount(raw: unknown): number | null {
  if (typeof raw === "number") {
    return Number.isFinite(raw) && raw >= 0 ? raw : null;
  }
  if (typeof raw !== "string") {
    return null;
  }
  let text = raw.replace(/[^\d.,]/g, "");
  if (!/\d/.test(text)) {
    return null;
  }
  const separator = Math.max(text.lastIndexOf("."), text.lastIndexOf(","));
  if (separator >= 0) {
    const decimals = text.length - separator - 1;
    const repeated = text.split(text[separator]).length > 2;
    const mixed = text.includes(".") && text.includes(",");
    // Separador de miles: se repite ("1.250.000") o es el unico y deja 3 digitos ("350.000").
    // Si hay de los dos tipos, el ultimo es el decimal ("350.000,50").
    const isThousands = repeated || (!mixed && decimals === 3);
    text = isThousands
      ? text.replace(/[.,]/g, "")
      : `${text.slice(0, separator).replace(/[.,]/g, "")}.${text.slice(separator + 1)}`;
  }
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
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

export function amountsMatch(expected: number, read: number): boolean {
  return Math.abs(expected - read) <= RECEIPT_AMOUNT_TOLERANCE;
}

export type ReceiptDecision = { ok: true } | { ok: false; reason: string };

// ¿La foto sirve como soporte de este gasto?
export function evaluateReceipt(
  review: ReceiptReview,
  expense: { amount: number; accountType: ReceiptAccountType },
): ReceiptDecision {
  if (review.kind === "OTRO") {
    return {
      ok: false,
      reason: "La foto no parece un comprobante de pago (transferencia, Nequi/Daviplata, factura o recibo).",
    };
  }
  const isCash = expense.accountType === "CASH";
  if (CASH_ONLY_KINDS.includes(review.kind) && !isCash) {
    return {
      ok: false,
      reason: `La foto es de ${RECEIPT_KIND_LABELS[review.kind]}, pero el gasto salió de una cuenta que no es efectivo: se necesita el comprobante del pago (transferencia, Nequi/Daviplata, factura o recibo).`,
    };
  }
  if (review.readAmount === null || !Number.isFinite(review.readAmount)) {
    return {
      ok: false,
      reason:
        review.kind === "DINERO_EFECTIVO"
          ? "No se pudo contar el dinero de la foto. Toma otra foto con los billetes bien extendidos."
          : "No se pudo leer el monto en la foto. Toma otra foto más clara y completa.",
    };
  }
  if (!amountsMatch(expense.amount, review.readAmount)) {
    const what = review.kind === "DINERO_EFECTIVO" ? "El dinero de la foto suma" : "La foto dice";
    return {
      ok: false,
      reason: `${what} ${formatCop(review.readAmount)} y el gasto es de ${formatCop(expense.amount)}.`,
    };
  }
  return { ok: true };
}
