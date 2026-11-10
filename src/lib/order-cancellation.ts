// Cancelar una orden con motivo de lista (nov-2026). Puro (sin base) para probarlo y usarlo en el cliente.

import { colombiaMonthKey } from "./colombia-time";

export const CANCEL_REASONS = [
  { key: "CLIENTA_CANCELO", label: "La clienta decidió cancelar" },
  { key: "NO_CONTESTO", label: "La clienta no contestó" },
  { key: "ERROR_AL_CARGAR", label: "Error al cargar la orden" },
  { key: "PRODUCTO_NO_DISPONIBLE", label: "Producto no disponible" },
  { key: "OTRO", label: "Otro" },
] as const;

export type CancelReasonKey = (typeof CANCEL_REASONS)[number]["key"];

export const CANCEL_OTHER_MIN = 3;
export const CANCEL_OTHER_MAX = 200;
export const CANCEL_NOTES_MAX = 500;

export const CANCEL_BLOCK_DISPATCH = "Tiene un despacho activo: usa Registrar devolución";

export type CancelInput = { reason: CancelReasonKey; reasonText: string | null; notas: string | null };
export type CancelInputResult = { ok: true; value: CancelInput } | { ok: false; error: string };

export function cancelReasonLabel(key: string): string {
  return CANCEL_REASONS.find((r) => r.key === key)?.label ?? key;
}

function text(formData: FormData, name: string): string {
  const raw = formData.get(name);
  return typeof raw === "string" ? raw.trim() : "";
}

// Campos del formulario: cancelReason, cancelReasonText (obligatorio con OTRO) y cancelNotes (opcional).
export function parseCancelInput(formData: FormData): CancelInputResult {
  const reason = text(formData, "cancelReason");
  if (!reason) return { ok: false, error: "Elige el motivo." };
  if (!CANCEL_REASONS.some((r) => r.key === reason)) return { ok: false, error: "Ese motivo no está en la lista." };

  const reasonText = text(formData, "cancelReasonText");
  if (reason === "OTRO" && reasonText.length < CANCEL_OTHER_MIN) {
    return { ok: false, error: `Escribe cuál es el motivo (mínimo ${CANCEL_OTHER_MIN} letras).` };
  }
  if (reasonText.length > CANCEL_OTHER_MAX) {
    return { ok: false, error: `El motivo no puede pasar de ${CANCEL_OTHER_MAX} letras.` };
  }

  const notas = text(formData, "cancelNotes");
  if (notas.length > CANCEL_NOTES_MAX) {
    return { ok: false, error: `Las notas no pueden pasar de ${CANCEL_NOTES_MAX} letras.` };
  }

  return {
    ok: true,
    value: { reason: reason as CancelReasonKey, reasonText: reason === "OTRO" ? reasonText : null, notas: notas || null },
  };
}

// Nota del historial: "Motivo: <etiqueta>[ — texto]. Notas: …".
export function cancelNote(input: CancelInput): string {
  const motivo = `Motivo: ${cancelReasonLabel(input.reason)}${input.reasonText ? ` — ${input.reasonText}` : ""}.`;
  return input.notas ? `${motivo} Notas: ${input.notas}` : motivo;
}

// Un despacho que no está CANCELLED ni RETURNED (mismo filtro que pasar a DESPACHADO) bloquea la cancelación.
export function cancelBlock(dispatches: { status: string }[]): string | null {
  return dispatches.some((d) => d.status !== "CANCELLED" && d.status !== "RETURNED") ? CANCEL_BLOCK_DISPATCH : null;
}

// OF abierta = sin recibir (receivedAt vacío); las OF no tienen estado "cancelada" en la base.
export function openManufacturingOrders<T extends { receivedAt: Date | string | null }>(ofs: T[]): T[] {
  return ofs.filter((of) => !of.receivedAt);
}

// Cobros = algún abono o un anticipo mayor que 0 (ventas viejas pueden tener solo el anticipo).
export function hasPayments(
  sale: { salePayments?: unknown[] | null; downPaymentAmount?: unknown } | null | undefined,
): boolean {
  if (!sale) return false;
  return (sale.salePayments?.length ?? 0) > 0 || Number(sale.downPaymentAmount ?? 0) > 0;
}

// --- Reactivar (parte 2) ---

export const ORDER_CANCELLED_BLOCK = "La orden está cancelada: reactívala primero";
export const REACTIVATE_MIN = 3;
export const REACTIVATE_MAX = 200;

// Mensaje de las acciones que no aceptan una orden cerrada: con CANCELLED el nuevo, si no el de siempre.
export function closedOrderMessage(status: string, fallback: string): string {
  return status === "CANCELLED" ? ORDER_CANCELLED_BLOCK : fallback;
}

// Campo del formulario: reactivateReason (de 3 a 200 letras).
export function parseReactivateInput(formData: FormData): { ok: true; motivo: string } | { ok: false; error: string } {
  const motivo = text(formData, "reactivateReason");
  if (motivo.length < REACTIVATE_MIN) {
    return { ok: false, error: `Escribe el motivo (mínimo ${REACTIVATE_MIN} letras).` };
  }
  if (motivo.length > REACTIVATE_MAX) {
    return { ok: false, error: `El motivo no puede pasar de ${REACTIVATE_MAX} letras.` };
  }
  return { ok: true, motivo };
}

type HistoryEntry = { fromStatus: string | null; toStatus: string; createdAt: Date | string };

// La última entrada a CANCELLED del historial (en cualquier orden), o null. La usa la franja roja de la ficha.
export function ultimaCancelacion<T extends HistoryEntry>(historial: T[]): T | null {
  return historial
    .filter((h) => h.toStatus === "CANCELLED")
    .reduce<T | null>((last, h) => (!last || new Date(h.createdAt) > new Date(last.createdAt) ? h : last), null);
}

// Estado al que vuelve: el de antes de la última cancelación; sin dato (o si era CANCELLED), RELEASED.
export function estadoAlReactivar(historial: HistoryEntry[]): string {
  const from = ultimaCancelacion(historial)?.fromStatus;
  return from && from !== "CANCELLED" ? from : "RELEASED";
}

// Lo que falta sacar del stock al reactivar, por producto: lo que entró al cancelar menos lo ya sacado
// en reactivaciones anteriores. Así una orden cancelada y reactivada varias veces no resta dos veces.
export function stockToRetake(
  movements: { productId: string; change: number; note: string | null }[],
  orderCode: string,
): Map<string, number> {
  const cancelNoteText = `Reversa por cancelacion de orden ${orderCode}`;
  const reactivateNoteText = reactivateStockNote(orderCode);
  const net = new Map<string, number>();
  for (const m of movements) {
    if (m.note !== cancelNoteText && m.note !== reactivateNoteText) continue;
    net.set(m.productId, (net.get(m.productId) ?? 0) + m.change);
  }
  return new Map([...net].filter(([, qty]) => qty > 0));
}

export function reactivateStockNote(orderCode: string): string {
  return `Reactivación de orden ${orderCode}`;
}

// --- Vista «Canceladas» (parte 3) ---

export const CANCEL_SIN_DATO = "SIN_DATO";

export type MotivoCancelacion = {
  clave: CancelReasonKey | typeof CANCEL_SIN_DATO;
  etiqueta: string;
  texto: string | null;
  notas: string | null;
};

const SIN_MOTIVO: MotivoCancelacion = { clave: CANCEL_SIN_DATO, etiqueta: "Sin dato", texto: null, notas: null };

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

// Lee la nota que escribe cancelNote ("Motivo: <etiqueta>[ — texto]. Notas: …"). Solo reconoce etiquetas de la lista.
function motivoDeNota(note: string | null | undefined): MotivoCancelacion | null {
  if (!note?.startsWith("Motivo: ")) return null;
  const resto = note.slice("Motivo: ".length);
  const corte = resto.indexOf(". Notas: ");
  const motivo = (corte >= 0 ? resto.slice(0, corte) : resto).replace(/\.$/, "");
  const notas = corte >= 0 ? str(resto.slice(corte + ". Notas: ".length)) : null;
  const reason = CANCEL_REASONS.find((r) => motivo === r.label || motivo.startsWith(`${r.label} — `));
  if (!reason) return null;
  const texto = str(motivo.slice(reason.label.length).replace(/^ — /, ""));
  return { clave: reason.key, etiqueta: reason.label, texto, notas };
}

// Motivo de la última cancelación: primero la nota del historial; si falta, el `after` de la bitácora; si no, «Sin dato».
export function motivoDeCancelacion(historialNote: string | null | undefined, logAfter: unknown): MotivoCancelacion {
  const deNota = motivoDeNota(historialNote);
  if (deNota) return deNota;
  const after = logAfter && typeof logAfter === "object" ? (logAfter as Record<string, unknown>) : null;
  const reason = CANCEL_REASONS.find((r) => r.key === after?.motivoClave);
  if (!reason || !after) return SIN_MOTIVO;
  const motivo = str(after.motivo);
  const texto = motivo?.startsWith(`${reason.label} — `) ? str(motivo.slice(reason.label.length + 3)) : null;
  return { clave: reason.key, etiqueta: reason.label, texto, notas: str(after.notas) };
}

export type CanceladaFila = {
  orderId: string;
  orderCode: string;
  saleCode: string | null;
  clienta: string;
  productos: string;
  asesora: string;
  motivo: MotivoCancelacion;
  canceladoPor: string;
  fecha: Date;
  tieneCobros: boolean;
};

export type FiltrosCanceladas = { mes: string | null; motivo: string | null };

export function parseFiltrosCanceladas(params: Record<string, string | string[] | undefined>): FiltrosCanceladas {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || null;
  const mes = one(params.mes);
  const motivo = one(params.motivo);
  return {
    mes: mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes) ? mes : null,
    motivo: motivo && (motivo === CANCEL_SIN_DATO || CANCEL_REASONS.some((r) => r.key === motivo)) ? motivo : null,
  };
}

// Mes = el de la cancelación en hora Colombia. La más reciente primero.
export function filtrarCanceladas(filas: CanceladaFila[], f: FiltrosCanceladas): CanceladaFila[] {
  return filas
    .filter((r) => (!f.mes || colombiaMonthKey(r.fecha) === f.mes) && (!f.motivo || r.motivo.clave === f.motivo))
    .sort((a, b) => b.fecha.getTime() - a.fecha.getTime() || b.orderCode.localeCompare(a.orderCode));
}

export function resumenCanceladas(filas: CanceladaFila[]) {
  const porMotivo = new Map<string, number>();
  for (const fila of filas) porMotivo.set(fila.motivo.etiqueta, (porMotivo.get(fila.motivo.etiqueta) ?? 0) + 1);
  return {
    cantidad: filas.length,
    conCobros: filas.filter((f) => f.tieneCobros).length,
    porMotivo: [...porMotivo]
      .map(([etiqueta, cantidad]) => ({ etiqueta, cantidad }))
      .sort((a, b) => b.cantidad - a.cantidad || a.etiqueta.localeCompare(b.etiqueta)),
  };
}
