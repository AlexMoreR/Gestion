// Validacion de la consulta publica (guia + ultimos 4 del celular) y limite de intentos.
// Puro: sin Prisma ni Node, para poder probarlo.

// Ultimos 4 digitos del celular guardado del cliente. null si no tiene al menos 4 digitos.
export function phoneLast4(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}

// Lo que escribe el cliente debe ser exactamente 4 digitos (se toleran espacios).
export function parseLast4Input(raw: string | null | undefined): string | null {
  const text = (raw ?? "").replace(/\s+/g, "");
  return /^\d{4}$/.test(text) ? text : null;
}

// Comparacion en tiempo constante (no corta en el primer caracter distinto).
export function safeEqual(a: string, b: string): boolean {
  const length = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < length; i += 1) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

// Celular enmascarado para pantallas internas: "*** *** 1234".
export function maskPhone(phone: string | null | undefined): string {
  const last4 = phoneLast4(phone);
  return last4 ? `*** *** ${last4}` : "Sin celular";
}

// Nombre abreviado de quien recibio: "Ana Maria Lopez" -> "Ana L."
export function abbreviateName(name: string | null | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return "";
  }
  if (words.length === 1) {
    return words[0];
  }
  return `${words[0]} ${words[words.length - 1].charAt(0).toUpperCase()}.`;
}

export function firstName(name: string | null | undefined): string {
  return (name ?? "").trim().split(/\s+/)[0] ?? "";
}

// --- Limite de intentos ---
export const LOOKUP_WINDOW_MS = 60 * 60 * 1000; // 1 hora
export const MAX_FAILURES_PER_IP = 10;
export const MAX_FAILURES_PER_CODE = 5;
export const LOOKUP_RETENTION_DAYS = 30;

export type LookupLimitInput = {
  ipFailures: number; // fallos de esta IP en la ultima hora
  codeFailures: number; // fallos de esta guia en la ultima hora (cualquier IP)
};

export type LookupLimitDecision = { allowed: true } | { allowed: false; reason: "IP" | "CODE" };

export function evaluateLookupLimit({ ipFailures, codeFailures }: LookupLimitInput): LookupLimitDecision {
  if (ipFailures >= MAX_FAILURES_PER_IP) {
    return { allowed: false, reason: "IP" };
  }
  if (codeFailures >= MAX_FAILURES_PER_CODE) {
    return { allowed: false, reason: "CODE" };
  }
  return { allowed: true };
}

export const LOOKUP_GENERIC_ERROR = "La guía o el celular no coinciden. Revisa e intenta de nuevo.";
export const LOOKUP_BLOCKED_ERROR = "Hiciste demasiados intentos. Intenta de nuevo en 1 hora.";
