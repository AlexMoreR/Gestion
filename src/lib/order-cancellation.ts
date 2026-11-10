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
