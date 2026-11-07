// Devoluciones de productos de una orden. Puro (sin base) para probarlo y usarlo en el cliente.
// Registrar, anular y escribir en la base es de otras partes; aquí solo se decide.
import { todayInColombia } from "./colombia-time";
import { roundMoney } from "./pricing";

export const RETURN_REASONS = [
  { key: "MAL_ESTADO", label: "Producto en mal estado" },
  { key: "NO_LO_QUISO", label: "El cliente no lo quiso" },
  { key: "DIRECCION_ERRONEA", label: "Dirección errónea" },
  { key: "NO_CONTESTO", label: "El cliente no contestó" },
  { key: "OTRO", label: "Otro" },
] as const;

export const RETURN_LOCATIONS = [
  { key: "EN_TRANSITO", label: "En tránsito" },
  { key: "BODEGA", label: "En bodega" },
  { key: "PERDIDO", label: "Perdido" },
] as const;

export const RETURN_NEXT_STEPS = [
  { key: "POR_DEFINIR", label: "Por definir" },
  { key: "REENVIAR", label: "Reenviar" },
  { key: "CAMBIAR", label: "Cambiar el producto" },
  { key: "REPARAR", label: "Reparar" },
  { key: "CERRAR", label: "Cerrar" },
] as const;

export type ReturnReasonKey = (typeof RETURN_REASONS)[number]["key"];
export type ReturnLocationKey = (typeof RETURN_LOCATIONS)[number]["key"];
export type ReturnNextStepKey = (typeof RETURN_NEXT_STEPS)[number]["key"];

export const RETURN_OTHER_MIN = 3;
export const RETURN_OTHER_MAX = 200;
export const RETURN_COMMENT_MAX = 500;
export const RETURN_CARRIER_MAX = 120;
export const RETURN_FREIGHT_MAX = 20_000_000;
// Prefijo de los campos de cantidad: "returnQty:<orderItemId>".
export const RETURN_QTY_PREFIX = "returnQty:";

type Option = { key: string; label: string };
function labelOf(list: readonly Option[], key: string): string {
  return list.find((o) => o.key === key)?.label ?? key;
}
export const returnReasonLabel = (key: string) => labelOf(RETURN_REASONS, key);
export const returnLocationLabel = (key: string) => labelOf(RETURN_LOCATIONS, key);
export const returnNextStepLabel = (key: string) => labelOf(RETURN_NEXT_STEPS, key);

export type ReturnLine = { orderItemId: string; quantity: number };

export type OrderReturnInput = {
  returnDate: Date; // medianoche UTC: fecha escrita por una persona
  reason: ReturnReasonKey;
  reasonText: string | null;
  comment: string | null;
  location: ReturnLocationKey;
  nextStep: ReturnNextStepKey;
  returnFreight: number | null;
  carrierSupplierId: string | null;
  carrierName: string | null;
  items: ReturnLine[];
};
export type OrderReturnInputResult = { ok: true; value: OrderReturnInput } | { ok: false; error: string };

function text(formData: FormData, name: string): string {
  const raw = formData.get(name);
  return typeof raw === "string" ? raw.trim() : "";
}

// Campos: returnDate (AAAA-MM-DD), returnReason, returnReasonText (con OTRO), returnComment, returnLocation,
// returnNextStep, returnFreight (opcional), returnCarrierSupplierId / returnCarrierName (opcionales) y
// returnQty:<orderItemId> por producto (las vacías o en 0 no cuentan). `hoy` solo para pruebas.
export function parseOrderReturnInput(formData: FormData, hoy: string = todayInColombia()): OrderReturnInputResult {
  const dateRaw = text(formData, "returnDate");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) return { ok: false, error: "Escribe la fecha de la devolución." };
  const returnDate = new Date(`${dateRaw}T00:00:00.000Z`);
  if (Number.isNaN(returnDate.getTime()) || returnDate.toISOString().slice(0, 10) !== dateRaw) {
    return { ok: false, error: "La fecha no es válida." };
  }
  if (dateRaw > hoy) return { ok: false, error: "La fecha no puede ser futura." };

  const reason = text(formData, "returnReason");
  if (!reason) return { ok: false, error: "Elige el motivo." };
  if (!RETURN_REASONS.some((r) => r.key === reason)) return { ok: false, error: "Ese motivo no está en la lista." };
  const otherText = text(formData, "returnReasonText");
  if (reason === "OTRO" && otherText.length < RETURN_OTHER_MIN) {
    return { ok: false, error: `Escribe cuál es el motivo (mínimo ${RETURN_OTHER_MIN} letras).` };
  }
  if (otherText.length > RETURN_OTHER_MAX) {
    return { ok: false, error: `El motivo no puede pasar de ${RETURN_OTHER_MAX} letras.` };
  }

  const location = text(formData, "returnLocation");
  if (!RETURN_LOCATIONS.some((l) => l.key === location)) return { ok: false, error: "Elige dónde está el producto." };
  const nextStep = text(formData, "returnNextStep");
  if (!RETURN_NEXT_STEPS.some((s) => s.key === nextStep)) return { ok: false, error: "Elige el siguiente paso." };

  const comment = text(formData, "returnComment");
  if (comment.length > RETURN_COMMENT_MAX) {
    return { ok: false, error: `El comentario no puede pasar de ${RETURN_COMMENT_MAX} letras.` };
  }

  const freightRaw = text(formData, "returnFreight");
  let returnFreight: number | null = null;
  if (freightRaw) {
    const value = Number(freightRaw);
    if (!Number.isFinite(value) || value < 0) return { ok: false, error: "El flete de vuelta no es válido." };
    if (value > RETURN_FREIGHT_MAX) return { ok: false, error: "El flete de vuelta es demasiado alto." };
    returnFreight = roundMoney(value);
  }

  const carrierName = text(formData, "returnCarrierName");
  if (carrierName.length > RETURN_CARRIER_MAX) {
    return { ok: false, error: `La transportadora no puede pasar de ${RETURN_CARRIER_MAX} letras.` };
  }

  const items: ReturnLine[] = [];
  for (const [name, raw] of formData.entries()) {
    if (!name.startsWith(RETURN_QTY_PREFIX) || typeof raw !== "string" || raw.trim() === "") continue;
    const orderItemId = name.slice(RETURN_QTY_PREFIX.length);
    const quantity = Number(raw.trim());
    if (!orderItemId || !Number.isInteger(quantity) || quantity < 0) {
      return { ok: false, error: "Las cantidades deben ser números enteros." };
    }
    if (quantity === 0) continue;
    if (items.some((i) => i.orderItemId === orderItemId)) return { ok: false, error: "Un producto está repetido." };
    items.push({ orderItemId, quantity });
  }
  if (items.length === 0) return { ok: false, error: "Elige al menos un producto devuelto." };

  return {
    ok: true,
    value: {
      returnDate,
      reason: reason as ReturnReasonKey,
      reasonText: reason === "OTRO" ? otherText : null,
      comment: comment || null,
      location: location as ReturnLocationKey,
      nextStep: nextStep as ReturnNextStepKey,
      returnFreight,
      carrierSupplierId: text(formData, "returnCarrierSupplierId") || null,
      carrierName: carrierName || null,
      items,
    },
  };
}

function sumByItem(lines: ReturnLine[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const line of lines) map.set(line.orderItemId, (map.get(line.orderItemId) ?? 0) + line.quantity);
  return map;
}

export type DispatchStatusKey = "PENDING" | "PACKING" | "SHIPPED" | "DELIVERED" | "RETURNED" | "CANCELLED";

export type ReturnEffect =
  | { tipo: "SOLO_REGISTRO" }
  | { tipo: "PASAR_A_DEVUELTO" }
  | { tipo: "MARCAR_NO_ENTREGADAS"; orderItemIds: string[] };
export type ReturnEffectResult = { ok: true; efecto: ReturnEffect } | { ok: false; error: string };

// Qué hace registrar la devolución según el despacho.
// `salieron`: líneas del despacho (o, sin despacho, las de la orden); `devueltasAntes`: devoluciones abiertas
// anteriores del mismo despacho; `nuevas`: lo que se registra ahora.
export function efectoDeRegistrar(input: {
  dispatchStatus: DispatchStatusKey | null;
  salieron: ReturnLine[];
  devueltasAntes: ReturnLine[];
  nuevas: ReturnLine[];
}): ReturnEffectResult {
  if (input.nuevas.length === 0) return { ok: false, error: "Elige al menos un producto devuelto." };
  const { dispatchStatus } = input;
  if (dispatchStatus && dispatchStatus !== "SHIPPED" && dispatchStatus !== "DELIVERED" && dispatchStatus !== "RETURNED") {
    return { ok: false, error: "Ese despacho no ha salido: no se puede registrar una devolución." };
  }

  const salieron = sumByItem(input.salieron);
  const antes = sumByItem(input.devueltasAntes);
  const nuevas = sumByItem(input.nuevas);
  for (const [orderItemId, quantity] of nuevas) {
    const max = salieron.get(orderItemId) ?? 0;
    if (quantity <= 0) return { ok: false, error: "Las cantidades deben ser mayores que cero." };
    if (max === 0) return { ok: false, error: "Un producto devuelto no salió en ese despacho." };
    if ((antes.get(orderItemId) ?? 0) + quantity > max) {
      return { ok: false, error: "Se devuelven más unidades de las que salieron." };
    }
  }

  // Línea completa: entre esta y las devoluciones abiertas anteriores ya volvió todo lo que salió.
  const completa = (orderItemId: string) =>
    (antes.get(orderItemId) ?? 0) + (nuevas.get(orderItemId) ?? 0) >= (salieron.get(orderItemId) ?? 0);

  if (dispatchStatus === "SHIPPED") {
    const todo = [...salieron.keys()].every(completa);
    return { ok: true, efecto: todo ? { tipo: "PASAR_A_DEVUELTO" } : { tipo: "SOLO_REGISTRO" } };
  }
  if (dispatchStatus === "DELIVERED") {
    const orderItemIds = [...nuevas.keys()].filter(completa);
    return { ok: true, efecto: orderItemIds.length > 0 ? { tipo: "MARCAR_NO_ENTREGADAS", orderItemIds } : { tipo: "SOLO_REGISTRO" } };
  }
  // RETURNED (la guía ya lo marcó) o sin despacho: solo queda el registro.
  return { ok: true, efecto: { tipo: "SOLO_REGISTRO" } };
}

export function estaAbierta(devolucion: { closedAt: Date | null; annulledAt: Date | null }): boolean {
  return devolucion.closedAt === null && devolucion.annulledAt === null;
}

// Anular una devolución abierta puede volver el despacho a SHIPPED solo si fue esta devolución la que lo pasó a
// RETURNED (estaba SHIPPED antes) y ningún otro despacho vivo (ni CANCELLED ni RETURNED) lleva esos productos.
export function puedeVolverAEnviado(input: {
  devolucion: { closedAt: Date | null; annulledAt: Date | null; dispatchStatusBefore: DispatchStatusKey | null };
  dispatchStatus: DispatchStatusKey | null;
  orderItemIds: string[];
  otrosDespachos: { status: DispatchStatusKey; orderItemIds: string[] }[];
}): boolean {
  if (!estaAbierta(input.devolucion)) return false;
  if (input.dispatchStatus !== "RETURNED" || input.devolucion.dispatchStatusBefore !== "SHIPPED") return false;
  const ids = new Set(input.orderItemIds);
  return !input.otrosDespachos.some(
    (d) => d.status !== "CANCELLED" && d.status !== "RETURNED" && d.orderItemIds.some((id) => ids.has(id)),
  );
}

type Money = number | string | { toString(): string } | null | undefined;
const toNumber = (value: Money): number => {
  const n = Number(value === null || value === undefined ? 0 : String(value));
  return Number.isFinite(n) ? n : 0;
};

export type ReturnLoss = { ida: number; idaSinRepartir: boolean; etiquetaIda: string | null; vuelta: number; total: number };

// Pérdida informativa (no escribe dinero): flete de ida de lo devuelto + flete de vuelta.
// Ida: DispatchItem.shippingCost en proporción a lo devuelto; si nada está repartido, el total del despacho.
export function perdidaDevolucion(input: {
  despacho: { shippingCost: Money; lineas: { orderItemId: string; quantity: number; shippingCost: Money }[] } | null;
  devueltas: ReturnLine[];
  returnFreight: Money;
}): ReturnLoss {
  const vuelta = roundMoney(toNumber(input.returnFreight));
  let ida = 0;
  let idaSinRepartir = false;
  if (input.despacho) {
    const lineas = input.despacho.lineas;
    if (lineas.every((l) => toNumber(l.shippingCost) === 0)) {
      ida = toNumber(input.despacho.shippingCost);
      idaSinRepartir = ida > 0;
    } else {
      const qty = new Map<string, number>();
      const cost = new Map<string, number>();
      for (const l of lineas) {
        qty.set(l.orderItemId, (qty.get(l.orderItemId) ?? 0) + l.quantity);
        cost.set(l.orderItemId, (cost.get(l.orderItemId) ?? 0) + toNumber(l.shippingCost));
      }
      for (const [orderItemId, quantity] of sumByItem(input.devueltas)) {
        const salio = qty.get(orderItemId) ?? 0;
        if (salio > 0) ida += ((cost.get(orderItemId) ?? 0) * Math.min(quantity, salio)) / salio;
      }
    }
  }
  ida = roundMoney(ida);
  return { ida, idaSinRepartir, etiquetaIda: idaSinRepartir ? "sin repartir" : null, vuelta, total: roundMoney(ida + vuelta) };
}
