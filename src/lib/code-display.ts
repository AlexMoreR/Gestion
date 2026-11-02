// Códigos internos para mostrar sin ceros adelante ("OF-00035" → "OF-35").
// La base guarda los 5 dígitos; esto solo cambia cómo se ven y cómo se buscan.

// Prefijos que generan src/lib/orders.ts, ventas, cotizaciones y fabricación.
const PREFIXES = "COT|SAL|ORD|OF|PRO|DSP|INV|COM|MAN";
const EXACT = new RegExp(`^(${PREFIXES})-0*(\\d+)$`, "i");
const IN_TEXT = new RegExp(`\\b(${PREFIXES})-0+(\\d+)\\b`, "gi");

/** "OF-00035" → "OF-35". Otro texto (CAM001, MG-7K4Q2P8) queda igual. */
export function displayCode<T extends string | null | undefined>(code: T): T {
  if (!code) return code;
  const match = EXACT.exec(code.trim());
  return (match ? `${match[1].toUpperCase()}-${Number(match[2])}` : code) as T;
}

/** Quita los ceros de cada código dentro de un texto libre. */
export function stripCodeZeros(text: string): string {
  return text.replace(IN_TEXT, (_, prefix: string, digits: string) => `${prefix.toUpperCase()}-${Number(digits)}`);
}

/** Formas en que puede estar guardado lo que se busca: ["OF-00035", "OF-35"]. */
export function storedCodeCandidates(input: string): string[] {
  const trimmed = input.trim();
  const match = EXACT.exec(trimmed);
  if (!match) return [trimmed];
  const prefix = match[1].toUpperCase();
  const number = String(Number(match[2]));
  return [...new Set([`${prefix}-${number.padStart(5, "0")}`, `${prefix}-${number}`])];
}
