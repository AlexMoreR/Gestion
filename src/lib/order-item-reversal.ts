// Reversas de entrega/despacho con motivo obligatorio. Puro (sin base) para probarlo y usarlo en el cliente.

export const REVERSAL_REASONS = [
  { key: "NO_LLEGO", label: "No llegó al cliente" },
  { key: "DANADO", label: "Llegó dañado" },
  { key: "EQUIVOCADO", label: "Producto equivocado (modelo, color o medida)" },
  { key: "FALTAN_PIEZAS", label: "Faltan piezas" },
  { key: "RECHAZADO", label: "El cliente lo rechazó o lo devolvió" },
  { key: "A_PROVEEDORA", label: "Se devolvió a la proveedora (garantía o arreglo)" },
  { key: "ERROR", label: "Se registró por error" },
  { key: "OTRO", label: "Otro" },
] as const;

export type ReversalReasonKey = (typeof REVERSAL_REASONS)[number]["key"];

export const REVERSAL_OTHER_MIN = 3;
export const REVERSAL_OTHER_MAX = 200;
export const REVERSAL_COMMENT_MAX = 500;

export type ReversalInput = { reason: ReversalReasonKey; reasonText: string | null; comment: string | null };
export type ReversalInputResult = { ok: true; value: ReversalInput } | { ok: false; error: string };

export const FALTA_FOTO_LLEGADA = "Falta la foto de cómo llegó";

// Al reversar una entrega, "Llegó dañado" exige foto de cómo llegó (prueba para reclamar).
export function pideFotoLlegada(reason: string): boolean {
  return reason === "DANADO";
}

export function reversalReasonLabel(key: string): string {
  return REVERSAL_REASONS.find((r) => r.key === key)?.label ?? key;
}

function text(formData: FormData, name: string): string {
  const raw = formData.get(name);
  return typeof raw === "string" ? raw.trim() : "";
}

// Campos del formulario: reversalReason, reversalReasonText (con OTRO) y reversalComment (opcional).
export function parseReversalInput(formData: FormData): ReversalInputResult {
  const reason = text(formData, "reversalReason");
  if (!reason) return { ok: false, error: "Elige el motivo." };
  if (!REVERSAL_REASONS.some((r) => r.key === reason)) return { ok: false, error: "Ese motivo no está en la lista." };

  const otherText = text(formData, "reversalReasonText");
  if (reason === "OTRO" && otherText.length < REVERSAL_OTHER_MIN) {
    return { ok: false, error: `Escribe cuál es el motivo (mínimo ${REVERSAL_OTHER_MIN} letras).` };
  }
  if (otherText.length > REVERSAL_OTHER_MAX) {
    return { ok: false, error: `El motivo no puede pasar de ${REVERSAL_OTHER_MAX} letras.` };
  }

  const comment = text(formData, "reversalComment");
  if (comment.length > REVERSAL_COMMENT_MAX) {
    return { ok: false, error: `El comentario no puede pasar de ${REVERSAL_COMMENT_MAX} letras.` };
  }

  return {
    ok: true,
    value: {
      reason: reason as ReversalReasonKey,
      reasonText: reason === "OTRO" ? otherText : null,
      comment: comment || null,
    },
  };
}

// "Entrega deshecha (ENTREGADO → DESPACHADO): Llegó dañado — comentario".
export function reversalLine(input: {
  action: string;
  fromState: string;
  toState: string;
  reason: string;
  reasonText?: string | null;
  comment?: string | null;
}): string {
  const motive = input.reason === "OTRO" && input.reasonText ? `Otro: ${input.reasonText}` : reversalReasonLabel(input.reason);
  const comment = input.comment ? ` — ${input.comment}` : "";
  return `${input.action} (${input.fromState} → ${input.toState}): ${motive}${comment}`;
}

// Estado de entrega de UN producto: Entregado solo si su despacho está DELIVERED y no se le reversó la entrega.
export function itemDeliveryState(input: {
  dispatchStatus: string;
  deliveryReversedAt: Date | null;
}): "ENTREGADO" | "DESPACHADO" {
  return input.dispatchStatus === "DELIVERED" && input.deliveryReversedAt === null ? "ENTREGADO" : "DESPACHADO";
}

// Productos con la entrega deshecha: línea de despacho DELIVERED con deliveryReversedAt, contada una vez por producto.
// Al volver a entregar la columna queda NULL y el producto deja de contar solo.
export function countReversedItems(
  lines: { orderItemId: string; dispatchStatus: string; deliveryReversedAt: Date | null }[],
): number {
  const items = new Set<string>();
  for (const line of lines) {
    if (line.dispatchStatus === "DELIVERED" && line.deliveryReversedAt !== null) items.add(line.orderItemId);
  }
  return items.size;
}

// Aviso para administración: contraentrega ya contada en Balances (orden COMPLETED) con productos reversados.
// Solo informa; reversar no recalcula dinero, fletes ni comisiones.
export function reversalMoneyWarning(input: {
  paymentMethod: string | null | undefined;
  orderStatus: string;
  reversedItems: number;
}): string | null {
  if (input.paymentMethod !== "CONTRAENTREGA" || input.orderStatus !== "COMPLETED" || input.reversedItems <= 0) {
    return null;
  }
  return `Esta venta ya cuenta en Balances y tiene ${input.reversedItems} producto(s) reversado(s). El dinero, los fletes y las comisiones no se recalculan solos: administración decide`;
}
