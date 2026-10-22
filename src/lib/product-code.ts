import { z } from "zod";

// Codigo de producto: 2 o 3 letras mayusculas + 3 digitos (ej. CAM001, PE012).
// Es la llave que une Gestion con NETMAGI y el CRM: obligatorio y unico.
export const PRODUCT_CODE_PATTERN = /^[A-Z]{2,3}[0-9]{3}$/;

export const PRODUCT_CODE_FORMAT_HINT = "2 o 3 letras y 3 numeros, sin puntos ni guiones (ej. CAM001)";

// Solo quita espacios y pasa a mayusculas. No quita puntos ni guiones:
// esos se rechazan para que la persona corrija el codigo a proposito.
export function normalizeProductCode(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().toUpperCase();
}

export type ProductCodeCheck = { ok: true; code: string } | { ok: false; error: string };

export function validateProductCode(raw: unknown): ProductCodeCheck {
  const code = normalizeProductCode(raw);
  if (!code) {
    return { ok: false, error: "El codigo del producto es obligatorio" };
  }
  if (/[.\-_\s/]/.test(code)) {
    return { ok: false, error: `El codigo "${code}" no puede tener puntos, guiones ni espacios. Formato: ${PRODUCT_CODE_FORMAT_HINT}` };
  }
  if (!PRODUCT_CODE_PATTERN.test(code)) {
    return { ok: false, error: `El codigo "${code}" no es valido. Formato: ${PRODUCT_CODE_FORMAT_HINT}` };
  }
  return { ok: true, code };
}

export const productCodeSchema = z.unknown().transform((value, ctx) => {
  const check = validateProductCode(value);
  if (!check.ok) {
    ctx.addIssue({ code: "custom", message: check.error });
    return z.NEVER;
  }
  return check.code;
});
