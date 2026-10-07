// Advertencia al elegir un transportador en el despacho (decision de Alexander, 7-oct-2026).
// Si el proveedor tiene Supplier.dispatchWarning se muestra ese texto (una idea por linea);
// si no, para Eleicid ("P-06 Eliecer") se usa el texto por defecto, detectado por nombre.
// Solo avisa: nunca bloquea el despacho.

export const ELEICID_DEFAULT_WARNING: readonly string[] = [
  "Suele demorar en mandar la guía: pídele la foto hoy y crea la guía Magilus.",
  "Avísale al cliente que el envío puede tardar más de lo normal.",
  "Úsalo solo para destinos lejanos.",
  "Págale solo cuando mande la foto de la guía.",
];

function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

const ELEICID_PATTERNS = ["elicid", "eliecer", "eleicid", "eliezer", "eleicer"];

export function isEleicidCarrierName(name: string | null | undefined): boolean {
  if (!name) {
    return false;
  }
  const key = normalizeName(name);
  return ELEICID_PATTERNS.some((pattern) => key.includes(pattern));
}

// Convierte el texto guardado en puntos: una linea = un punto (quita viñetas "-", "*", "•", "1.").
export function parseWarningLines(text: string | null | undefined): string[] {
  if (!text) {
    return [];
  }
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter((line) => line.length > 0);
}

export function resolveDispatchWarning(carrier: {
  name: string;
  displayName?: string | null;
  dispatchWarning?: string | null;
} | null | undefined): string[] {
  if (!carrier) {
    return [];
  }
  const custom = parseWarningLines(carrier.dispatchWarning);
  if (custom.length > 0) {
    return custom;
  }
  if (isEleicidCarrierName(carrier.name) || isEleicidCarrierName(carrier.displayName)) {
    return [...ELEICID_DEFAULT_WARNING];
  }
  return [];
}

export const MAX_DISPATCH_WARNING_LENGTH = 1000;
