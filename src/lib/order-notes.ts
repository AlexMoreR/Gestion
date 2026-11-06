// Notas internas por orden: validación del texto y fecha/hora de Colombia. Puro (sin base) para probarlo.
import { colombiaTimeOfDay, todayInColombia } from "./colombia-time";

export const ORDER_NOTE_MAX = 1000;

export type OrderNoteTextResult = { ok: true; text: string } | { ok: false; error: string };

// Quita espacios de sobra (incluye saltos de línea repetidos al borde) y exige 1..1000 letras.
export function parseOrderNoteText(raw: unknown): OrderNoteTextResult {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return { ok: false, error: "Escribe la nota." };
  if (text.length > ORDER_NOTE_MAX) return { ok: false, error: `La nota no puede pasar de ${ORDER_NOTE_MAX} letras.` };
  return { ok: true, text };
}

// "AAAA-MM-DD HH:MM" en hora de Colombia (la nota es un momento real).
export function formatNoteDate(date: Date): string {
  return `${todayInColombia(date)} ${colombiaTimeOfDay(date)}`;
}

// Número sobre el ícono de nota de la lista de órdenes: hasta 99 tal cual; desde 100, "99+".
export function formatNoteCount(count: number): string {
  return count > 99 ? "99+" : String(count);
}
