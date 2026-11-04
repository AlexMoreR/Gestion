// Fotos del embalaje al despachar con transportadora: reglas puras (sin base de datos).
// Por producto: al menos 1 ABIERTO y 1 CERRADO, y máximo 5 (2 obligatorias + 3 EXTRA).
// LLEGADA (llegada a Cali) no cuenta para el tope.

export type EmbalajeTipo = "ABIERTO" | "CERRADO" | "EXTRA" | "LLEGADA";

export const EMBALAJE_MAX_FOTOS = 5;
export const FALTA_ABIERTO = "Falta la foto 1: producto empacado, paquete abierto";
export const FALTA_CERRADO = "Falta la foto 2: paquete cerrado con la guía";
export const FALTAN_LAS_DOS =
  "Faltan las fotos del embalaje: foto 1 (producto empacado, paquete abierto) y foto 2 (paquete cerrado con la guía)";
export const DEMASIADAS_FOTOS = "Máximo 5 fotos de embalaje por producto (2 obligatorias + 3 extra)";

// existentes = fotos ya guardadas sin despacho para el producto; nuevas = las del formulario.
// Devuelve el mensaje de error, o null si está bien.
export function validarFotosEmbalaje({
  existentes,
  nuevas,
}: {
  existentes: readonly EmbalajeTipo[];
  nuevas: readonly EmbalajeTipo[];
}): string | null {
  const todas = [...existentes, ...nuevas];
  const tieneAbierto = todas.includes("ABIERTO");
  const tieneCerrado = todas.includes("CERRADO");
  if (!tieneAbierto && !tieneCerrado) return FALTAN_LAS_DOS;
  if (!tieneAbierto) return FALTA_ABIERTO;
  if (!tieneCerrado) return FALTA_CERRADO;
  if (todas.filter((tipo) => tipo !== "LLEGADA").length > EMBALAJE_MAX_FOTOS) return DEMASIADAS_FOTOS;
  return null;
}
