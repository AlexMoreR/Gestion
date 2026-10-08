// Codigo de la guia Magilus. Antes era secuencial (MG-000001) y por eso adivinable: se veia que
// era la primera guia y se podia deducir la siguiente. Ahora es ALEATORIO y criptografico:
// MG- + 8 caracteres de un alfabeto sin letras ni numeros confusos (fuera O/0 e I/1/L). No
// revela el orden ni deja adivinar otra guia. La consulta publica exige ademas los ultimos 4
// digitos del celular.
import { randomBytes } from "node:crypto";

export const SHIPMENT_CODE_PREFIX = "MG";

// Alfabeto sin caracteres confusos: 23 letras (sin I, L, O) + 8 digitos (sin 0, 1) = 31.
const SHIPMENT_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const SHIPMENT_CODE_LENGTH = 8;

// Reintentos al asegurar que el codigo no exista ya en la base.
export const SHIPMENT_CODE_MAX_ATTEMPTS = 5;

// Cuerpo de un codigo NUEVO: 7 u 8 caracteres del alfabeto (se aceptan 7 por flexibilidad, hoy
// se generan 8). Los codigos nuevos nunca llevan 0 ni 1, eso los separa del formato viejo.
const NEW_CODE_BODY = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{7,8}$/;

// Genera un codigo aleatorio con crypto, sin sesgo de modulo: descarta los bytes del tramo
// incompleto (>= 248) para que las 31 letras tengan la misma probabilidad.
export function buildShipmentCode(): string {
  const n = SHIPMENT_CODE_ALPHABET.length; // 31
  const max = Math.floor(256 / n) * n; // 248: mayor multiplo de 31 por debajo de 256
  let body = "";
  while (body.length < SHIPMENT_CODE_LENGTH) {
    const bytes = randomBytes(SHIPMENT_CODE_LENGTH * 2);
    for (let i = 0; i < bytes.length && body.length < SHIPMENT_CODE_LENGTH; i += 1) {
      const value = bytes[i];
      if (value < max) {
        body += SHIPMENT_CODE_ALPHABET[value % n];
      }
    }
  }
  return `${SHIPMENT_CODE_PREFIX}-${body}`;
}

// Genera un codigo garantizando que no exista ya: lo pregunta con `exists` y reintenta si choca.
// Lanza si tras `maxAttempts` intentos no consigue uno libre (practicamente imposible: 31^8).
export async function generateUniqueShipmentCode(
  exists: (code: string) => Promise<boolean>,
  maxAttempts: number = SHIPMENT_CODE_MAX_ATTEMPTS,
): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const code = buildShipmentCode();
    if (!(await exists(code))) {
      return code;
    }
  }
  throw new Error("No se pudo generar un codigo de guia unico.");
}

// Formato viejo (secuencial de 6 digitos) que ya quedo guardado en algunas guias: MG-000001.
// Solo se usa para reconocer esas guias existentes; las nuevas ya no se generan asi.
function buildLegacyCode(value: number): string {
  return `${SHIPMENT_CODE_PREFIX}-${String(value).padStart(6, "0")}`;
}

// Lleva lo que escribe el cliente, en cualquier forma, al codigo EXACTO guardado. Acepta el
// formato nuevo ("MG-7K4Q2P8") y el viejo ("MG-000001"): mayus/minus, con o sin "MG-", con o
// sin guion ni espacios. Devuelve null si no parece un numero de guia.
export function normalizeShipmentCodeInput(raw: string | null | undefined): string | null {
  const cleaned = (raw ?? "").toUpperCase().replace(/[\s-]+/g, "");
  if (!cleaned) {
    return null;
  }
  // Formato nuevo con prefijo "MG" pegado (el cuerpo tiene 7 u 8 del alfabeto).
  const afterPrefix = cleaned.startsWith(SHIPMENT_CODE_PREFIX)
    ? cleaned.slice(SHIPMENT_CODE_PREFIX.length)
    : null;
  if (afterPrefix && NEW_CODE_BODY.test(afterPrefix)) {
    return `${SHIPMENT_CODE_PREFIX}-${afterPrefix}`;
  }
  // Formato nuevo sin prefijo (el cuerpo solo). Como M y G tambien son del alfabeto, esto cubre
  // los codigos cuyo cuerpo empieza por "MG" que el intento anterior deja de 5-6 caracteres.
  if (NEW_CODE_BODY.test(cleaned)) {
    return `${SHIPMENT_CODE_PREFIX}-${cleaned}`;
  }
  // Formato viejo: solo digitos (con o sin "MG" y con ceros a la izquierda). Los codigos nuevos
  // no caen aqui porque nunca tienen 0 ni 1, y porque los digitos puros 2-9 de 7-8 largo ya los
  // tomaron las reglas de arriba.
  const legacy = /^(?:MG)?0*(\d{1,9})$/.exec(cleaned);
  if (legacy) {
    const value = Number(legacy[1]);
    if (Number.isFinite(value) && value > 0) {
      return buildLegacyCode(value);
    }
  }
  return null;
}
