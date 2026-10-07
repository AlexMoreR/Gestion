// Codigo de la guia Magilus: MG-000001 (secuencial, 6 digitos). Es adivinable por diseno;
// por eso la consulta publica exige ademas los ultimos 4 digitos del celular.

export const SHIPMENT_CODE_PREFIX = "MG";
const SHIPMENT_CODE_DIGITS = 6;
const SHIPMENT_CODE_PATTERN = /^MG-(\d+)$/;

export function buildShipmentCode(index: number): string {
  const safe = Number.isFinite(index) && index > 0 ? Math.floor(index) : 1;
  return `${SHIPMENT_CODE_PREFIX}-${String(safe).padStart(SHIPMENT_CODE_DIGITS, "0")}`;
}

export function parseShipmentCodeNumber(code: string | null | undefined): number {
  const match = SHIPMENT_CODE_PATTERN.exec((code ?? "").trim().toUpperCase());
  if (!match) {
    return 0;
  }
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : 0;
}

// Lo que escribe el cliente: "MG-000123", "mg123", "MG 123", "123" -> "MG-000123".
// Devuelve null si no hay un numero valido.
export function normalizeShipmentCodeInput(raw: string | null | undefined): string | null {
  const text = (raw ?? "").trim().toUpperCase().replace(/\s+/g, "");
  if (!text) {
    return null;
  }
  const match = /^(?:MG-?)?0*(\d{1,9})$/.exec(text);
  if (!match) {
    return null;
  }
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  return buildShipmentCode(value);
}
