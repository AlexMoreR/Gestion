// Peso de la guia en kilos (opcional). Se escribe a mano en Gestion: admite coma o punto
// decimal ("12,5" o "12.5") y se guarda con 2 decimales.

export const MAX_WEIGHT_KG = 10_000;

export type WeightParseResult = { ok: true; value: number | null } | { ok: false; error: string };

// Vacio = sin peso (null). Numero > 0 y < 10.000 kg; si no, error.
export function parseWeightKg(raw: unknown): WeightParseResult {
  if (raw == null) {
    return { ok: true, value: null };
  }
  if (typeof raw !== "string") {
    return { ok: false, error: "Peso inválido" };
  }
  const cleaned = raw.trim().replace(/\s+/g, "").replace(/kg$/i, "");
  if (!cleaned) {
    return { ok: true, value: null };
  }
  // Una sola coma o punto como separador decimal; sin separadores de miles.
  if (!/^\d+([.,]\d+)?$/.test(cleaned)) {
    return { ok: false, error: "Peso inválido: escribe solo el número en kg (ej. 12,5)" };
  }
  const value = Math.round(Number(cleaned.replace(",", ".")) * 100) / 100;
  if (!Number.isFinite(value) || value <= 0) {
    return { ok: false, error: "El peso debe ser mayor que 0 kg" };
  }
  if (value >= MAX_WEIGHT_KG) {
    return { ok: false, error: "El peso debe ser menor que 10.000 kg" };
  }
  return { ok: true, value };
}

// 12.5 -> "12,5 kg"; null -> null.
export function formatWeightKg(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return `${value.toLocaleString("es-CO", { maximumFractionDigits: 2 })} kg`;
}
