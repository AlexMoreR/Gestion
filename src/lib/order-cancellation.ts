// Cancelar una orden con motivo de lista (nov-2026). Puro (sin base) para probarlo y usarlo en el cliente.

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
