import { createHash, timingSafeEqual } from "node:crypto";

// Llave minima razonable: evita que una llave corta o vacia deje el servidor abierto.
export const MIN_API_KEY_LENGTH = 24;

// Acepta "Authorization: Bearer <llave>" o "x-api-key: <llave>".
export function extractApiKey(headers: Headers): string | null {
  const authorization = headers.get("authorization")?.trim();
  if (authorization && /^bearer\s+/i.test(authorization)) {
    const token = authorization.replace(/^bearer\s+/i, "").trim();
    if (token) return token;
  }
  const headerKey = headers.get("x-api-key")?.trim();
  return headerKey || null;
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

// Comparacion en tiempo constante. Sin llave configurada (o muy corta), nada pasa.
export function isValidApiKey(provided: string | null, expected: string | undefined): boolean {
  const configured = expected?.trim();
  if (!configured || configured.length < MIN_API_KEY_LENGTH || !provided) {
    return false;
  }
  return timingSafeEqual(digest(provided), digest(configured));
}
