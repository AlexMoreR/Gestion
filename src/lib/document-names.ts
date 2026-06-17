// Nombres legibles para los PDFs descargables (cotizacion y factura).

export const INVOICE_NUMBER_OFFSET = 100;

/** Convierte el codigo de venta (SAL-00012) en el numero de factura mostrado (00112). */
export function formatInvoiceNumber(code: string): string {
  const raw = code.split("-")[1] ?? code;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return raw;
  }
  return String(parsed + INVOICE_NUMBER_OFFSET).padStart(5, "0");
}

/** Limpia un texto para usarlo como nombre de archivo seguro en cualquier sistema. */
function sanitizeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Nombre de archivo para la cotizacion: "COTIZACION COT-0027.pdf". */
export function quotePdfFileName(quoteCode: string): string {
  return `${sanitizeFileName(`COTIZACION ${quoteCode}`)}.pdf`;
}

/** Nombre de archivo para la factura: "FACTURA 00112.pdf". */
export function invoicePdfFileName(saleCode: string): string {
  return `${sanitizeFileName(`FACTURA ${formatInvoiceNumber(saleCode)}`)}.pdf`;
}
