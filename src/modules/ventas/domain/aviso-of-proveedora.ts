// Aviso de la OF del combo a la proveedora por WhatsApp (nov-2026, parte 3). Reglas puras:
// el interruptor (AppSetting "avisoOFConfig") y el teléfono que se le pasa al CRM.

export const AVISO_OF_NUMERO_PRUEBA = "573196892277"; // el dueño
export const AVISO_OF_CRM_URL_POR_DEFECTO = "https://crm.magilus.com/api/gestion/whatsapp-proveedora";

export type AvisoOFModo = "apagado" | "prueba" | "proveedoras";
export type AvisoOFConfig = { modo: AvisoOFModo; numeroPrueba: string };
// ENVIANDO es el candado: se pone antes de mandar y solo si la OF seguía sin estado.
export type AvisoOFEstado = "ENVIANDO" | "ENVIADO" | "PRUEBA" | "ALERTA" | "FALLIDO";

const MODOS = new Set<AvisoOFModo>(["apagado", "prueba", "proveedoras"]);

// Teléfono con el 57 adelante, como lo espera el CRM: 10 dígitos de Colombia → 57 + número;
// 11 a 15 dígitos ya traen el indicativo. Otro → null (no sirve).
export function telefonoParaCrm(telefono: string | null | undefined): string | null {
  const digitos = (telefono ?? "").replace(/\D/g, "");
  if (digitos.length === 10) return `57${digitos}`;
  if (digitos.length >= 11 && digitos.length <= 15) return digitos;
  return null;
}

/** Vacío, roto o con un modo desconocido → «prueba» al número del dueño (nunca a la proveedora por error). */
export function parseAvisoOFConfig(raw: string | null | undefined): AvisoOFConfig {
  let valor: { modo?: unknown; numeroPrueba?: unknown } = {};
  try {
    const leido: unknown = raw ? JSON.parse(raw) : {};
    if (leido && typeof leido === "object") valor = leido as typeof valor;
  } catch {
    // Se queda en prueba.
  }
  const modo = typeof valor.modo === "string" && MODOS.has(valor.modo as AvisoOFModo) ? (valor.modo as AvisoOFModo) : "prueba";
  const numeroPrueba =
    (typeof valor.numeroPrueba === "string" && telefonoParaCrm(valor.numeroPrueba)) || AVISO_OF_NUMERO_PRUEBA;
  return { modo, numeroPrueba };
}
