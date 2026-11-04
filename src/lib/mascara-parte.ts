// Máscaras de color por parte (nov-2026): reglas puras. Una máscara es un PNG en blanco y negro del
// tamaño del lienzo de la foto de portada: blanco = la parte (ej. Tapizado), negro = el resto.

export const MASCARA_MAX_BYTES = 8 * 1024 * 1024;
/** Lado máximo del lienzo de pintar (en el celular una foto más grande va lenta). */
export const LIENZO_MAX_LADO = 2000;

const FIRMA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** ¿Los primeros bytes son los de un PNG de verdad? (no basta el nombre ni el tipo que manda el navegador). */
export function esPng(bytes: Uint8Array): boolean {
  return bytes.length > FIRMA_PNG.length && FIRMA_PNG.every((byte, i) => bytes[i] === byte);
}

/** Medida del lienzo para una foto: la misma, o reducida para que el lado mayor no pase de 2000 px. */
export function medidaLienzo(ancho: number, alto: number): { ancho: number; alto: number } {
  const escala = Math.min(1, LIENZO_MAX_LADO / Math.max(ancho, alto));
  return { ancho: Math.max(1, Math.round(ancho * escala)), alto: Math.max(1, Math.round(alto * escala)) };
}

/** Error en palabras si la máscara no sirve; null si está bien. */
export function validarMascara(m: {
  bytes: Uint8Array;
  ancho: number | undefined;
  alto: number | undefined;
  lienzo: { ancho: number; alto: number };
}): string | null {
  if (m.bytes.length === 0) return "La máscara está vacía";
  if (m.bytes.length > MASCARA_MAX_BYTES) return "La máscara pesa más de 8 MB";
  if (!esPng(m.bytes)) return "La máscara debe ser un PNG";
  if (m.ancho !== m.lienzo.ancho || m.alto !== m.lienzo.alto) {
    return "La máscara no tiene el tamaño de la foto de portada. Vuelve a abrir la pantalla de máscaras";
  }
  return null;
}

const clave = (texto: string) => texto.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/** Al volver a guardar las partes, cada parte con el mismo nombre (sin tildes ni mayúsculas) conserva su máscara. */
export function conservarMascaras<T extends { nombre: string }>(
  antes: { nombre: string; mascaraUrl: string | null }[],
  partes: T[],
): (T & { mascaraUrl: string | null })[] {
  const porNombre = new Map(antes.map((parte) => [clave(parte.nombre), parte.mascaraUrl]));
  return partes.map((parte) => ({ ...parte, mascaraUrl: porNombre.get(clave(parte.nombre)) ?? null }));
}
