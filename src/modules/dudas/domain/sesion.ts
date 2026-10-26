import { createHmac, timingSafeEqual } from "node:crypto";

// Sesion de /dudas en una cookie firmada (HMAC-SHA256): "<payload base64url>.<firma>".
// payload = { a: accesoId, n: nombre que escribio la persona, e: vence (ms) }.
// Secreto: DUDAS_SESSION_SECRET; si no existe, se deriva de AUTH_SECRET (que ya esta en el stack),
// asi funciona sin tocar Portainer. Cambiar cualquiera de los dos cierra todas las sesiones.

export const COOKIE_SESION_DUDAS = "dudas_sesion";
export const DURACION_SESION_MS = 30 * 24 * 60 * 60 * 1000;

export type SesionDudas = { accesoId: string; nombre: string; venceEn: number };

export function secretoSesionDudas(env: Record<string, string | undefined> = process.env): string {
  const propio = env.DUDAS_SESSION_SECRET?.trim();
  if (propio) return propio;
  const auth = env.AUTH_SECRET?.trim();
  if (!auth) return "";
  return createHmac("sha256", auth).update("dudas-catalogo:sesion").digest("base64url");
}

function firmar(payload: string, secreto: string): string {
  return createHmac("sha256", secreto).update(`dudas-sesion:${payload}`).digest("base64url");
}

export function crearTokenSesion(
  datos: { accesoId: string; nombre: string },
  secreto: string,
  ahora: number = Date.now(),
): string | null {
  if (!secreto) return null;
  const payload = Buffer.from(
    JSON.stringify({ a: datos.accesoId, n: datos.nombre, e: ahora + DURACION_SESION_MS }),
  ).toString("base64url");
  return `${payload}.${firmar(payload, secreto)}`;
}

export function leerTokenSesion(
  token: string | null | undefined,
  secreto: string,
  ahora: number = Date.now(),
): SesionDudas | null {
  const valor = (token ?? "").trim();
  const punto = valor.lastIndexOf(".");
  if (!secreto || punto <= 0 || valor.length > 800) return null;
  const payload = valor.slice(0, punto);
  const firma = valor.slice(punto + 1);
  const esperada = firmar(payload, secreto);
  const a = Buffer.from(esperada);
  const b = Buffer.from(firma);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const datos = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
    if (typeof datos.a !== "string" || typeof datos.n !== "string" || typeof datos.e !== "number") return null;
    if (datos.e <= ahora) return null;
    return { accesoId: datos.a, nombre: datos.n, venceEn: datos.e };
  } catch {
    return null;
  }
}
