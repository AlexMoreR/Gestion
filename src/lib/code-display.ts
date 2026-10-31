// Códigos del sistema: se guardan con ceros (COT-00150) y se muestran sin ceros (COT-150).
// El formato se aplica solo al pintar o entregar el código; nunca al ordenar ni comparar.

const SYSTEM_CODE_PREFIXES = ["COT", "SAL", "ORD", "OF", "PRO", "DSP", "INV", "COM", "MAN"];
const PREFIX_GROUP = SYSTEM_CODE_PREFIXES.join("|");
const SYSTEM_CODE = new RegExp(`^(${PREFIX_GROUP})-(\\d+)$`, "i");
const SYSTEM_CODE_IN_TEXT = new RegExp(`\\b(${PREFIX_GROUP})-0+(\\d+)\\b`, "g");

/** "OF-00035" → "OF-35". Cualquier otro texto queda igual. */
export function displayCode(code: string): string;
export function displayCode(code: string | null | undefined): string | null | undefined;
export function displayCode(code: string | null | undefined) {
  if (!code) return code;
  const match = SYSTEM_CODE.exec(code.trim());
  return match ? `${match[1]}-${Number(match[2])}` : code;
}

/** Quita los ceros de los códigos del sistema dentro de un texto libre (bitácora, notas, mensajes). */
export function stripCodeZeros(text: string): string;
export function stripCodeZeros(text: string | null | undefined): string | null | undefined;
export function stripCodeZeros(text: string | null | undefined) {
  if (!text) return text;
  return text.replace(SYSTEM_CODE_IN_TEXT, "$1-$2");
}

/**
 * Formas en que puede estar guardado un código que alguien escribió: "OF-35" → ["OF-00035", "OF-35"].
 * Sirve para buscar en la base con cualquiera de las dos formas. Otro texto → [texto].
 */
export function storedCodeCandidates(input: string): string[] {
  const value = input.trim();
  const match = SYSTEM_CODE.exec(value);
  if (!match) return [value];
  const prefix = match[1].toUpperCase();
  const number = String(Number(match[2]));
  return [...new Set([`${prefix}-${number.padStart(5, "0")}`, `${prefix}-${number}`])];
}
