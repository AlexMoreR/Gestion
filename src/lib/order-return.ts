// Devoluciones de productos de una orden. Puro (sin base) para probarlo y usarlo en el cliente.
// Registrar, anular y escribir en la base es de otras partes; aquí solo se decide.
import { colombiaDayKey, colombiaMonthKey, todayInColombia } from "./colombia-time";
import { displayCode } from "./code-display";
import { csvCell } from "../modules/ventas/domain/withholding";
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

export type OrderReturnEdit = Pick<
  OrderReturnInput,
  "reason" | "reasonText" | "comment" | "location" | "nextStep" | "returnFreight"
>;
export type OrderReturnEditResult = { ok: true; value: OrderReturnEdit } | { ok: false; error: string };

// «Editar» y registro comparten esto: motivo, dónde está, qué sigue, comentario y flete (sin fecha, productos,
// despacho ni transportadora, que no se editan).
export function parseOrderReturnEdit(formData: FormData): OrderReturnEditResult {
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

  return {
    ok: true,
    value: {
      reason: reason as ReturnReasonKey,
      reasonText: reason === "OTRO" ? otherText : null,
      comment: comment || null,
      location: location as ReturnLocationKey,
      nextStep: nextStep as ReturnNextStepKey,
      returnFreight,
    },
  };
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

  const details = parseOrderReturnEdit(formData);
  if (!details.ok) return details;

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
      ...details.value,
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

// Etiqueta de devolución de la orden (getOrderDisplayState). Puro.
// - DEVUELTA: las devoluciones abiertas cubren todas las unidades de la orden.
// - PARCIAL: cubren solo una parte.
// - FALTA_REGISTRAR: un despacho RETURNED sin devolución registrada (sin anular) cuyos productos no volvieron
//   a salir en otro despacho vivo. Un despacho viejo sin productos ligados cuenta si no hay ningún despacho vivo.
export function estadoDevolucionDeOrden(input: {
  orderItems: { id: string; quantity: number }[];
  devueltasAbiertas: ReturnLine[];
  despachos: { id: string; status: DispatchStatusKey | string; orderItemIds: string[] }[];
  despachosConDevolucion: string[];
}): "DEVUELTA" | "PARCIAL" | "FALTA_REGISTRAR" | null {
  const devueltas = sumByItem(input.devueltasAbiertas);
  const total = input.orderItems.reduce((sum, item) => sum + item.quantity, 0);
  const cubiertas = input.orderItems.reduce((sum, item) => sum + Math.min(devueltas.get(item.id) ?? 0, item.quantity), 0);
  if (cubiertas > 0) return cubiertas >= total ? "DEVUELTA" : "PARCIAL";

  return despachosFaltaRegistrar(input).length > 0 ? "FALTA_REGISTRAR" : null;
}

// Despachos RETURNED sin devolución registrada (sin anular) cuyos productos no volvieron a salir en otro despacho
// vivo. Lo usan la etiqueta de la orden y la vista de devoluciones («Devuelta – falta registrar»).
export function despachosFaltaRegistrar(input: {
  despachos: { id: string; status: DispatchStatusKey | string; orderItemIds: string[] }[];
  despachosConDevolucion: string[];
}): string[] {
  const conDevolucion = new Set(input.despachosConDevolucion);
  const vivos = input.despachos.filter((d) => d.status !== "CANCELLED" && d.status !== "RETURNED");
  const salieronOtraVez = new Set(vivos.flatMap((d) => d.orderItemIds));
  return input.despachos
    .filter(
      (d) =>
        d.status === "RETURNED" &&
        !conDevolucion.has(d.id) &&
        (d.orderItemIds.length === 0 ? vivos.length === 0 : d.orderItemIds.some((id) => !salieronOtraVez.has(id))),
    )
    .map((d) => d.id);
}

// Unidades que aún se pueden devolver de un despacho: lo que salió menos lo devuelto en devoluciones abiertas.
export function pendientesPorDevolver(salieron: ReturnLine[], devueltasAntes: ReturnLine[]): ReturnLine[] {
  const antes = sumByItem(devueltasAntes);
  return [...sumByItem(salieron)]
    .map(([orderItemId, quantity]) => ({ orderItemId, quantity: quantity - (antes.get(orderItemId) ?? 0) }))
    .filter((line) => line.quantity > 0);
}

// Antes y después de «Editar», solo con lo que cambió (para la bitácora). null = no cambió nada.
export function cambiosDeDevolucion(
  antes: { reason: string; reasonText: string | null; comment: string | null; location: string; nextStep: string; returnFreight: Money },
  despues: OrderReturnEdit,
): { before: Record<string, string | number | null>; after: Record<string, string | number | null> } | null {
  const motivo = (reason: string, reasonText: string | null) =>
    reason === "OTRO" && reasonText ? `Otro: ${reasonText}` : returnReasonLabel(reason);
  const flete = (value: Money) => (value === null || value === undefined ? null : roundMoney(toNumber(value)));
  const campos: [string, string | number | null, string | number | null][] = [
    ["motivo", motivo(antes.reason, antes.reasonText), motivo(despues.reason, despues.reasonText)],
    ["dondeEsta", returnLocationLabel(antes.location), returnLocationLabel(despues.location)],
    ["queSigue", returnNextStepLabel(antes.nextStep), returnNextStepLabel(despues.nextStep)],
    ["comentario", antes.comment || null, despues.comment || null],
    ["fleteVuelta", flete(antes.returnFreight), flete(despues.returnFreight)],
  ];
  const before: Record<string, string | number | null> = {};
  const after: Record<string, string | number | null> = {};
  for (const [campo, viejo, nuevo] of campos) {
    if (viejo === nuevo) continue;
    before[campo] = viejo;
    after[campo] = nuevo;
  }
  return Object.keys(after).length > 0 ? { before, after } : null;
}

export const ANNUL_REASON_MIN = 3;
export const ANNUL_REASON_MAX = 300;

export type AnnulEffect =
  | { tipo: "SOLO_ANULAR" }
  | { tipo: "VOLVER_A_ENVIADO" }
  // orderItemIds: líneas que esta devolución marcó como no entregadas y siguen así; sinTocar: líneas reversadas
  // después a mano (otra reversa), que no se tocan.
  | { tipo: "LIMPIAR_ENTREGA"; orderItemIds: string[]; sinTocar: string[] };
export type AnnulEffectResult = { ok: true; efecto: AnnulEffect } | { ok: false; error: string };

// Qué hace anular una devolución. Solo se anulan las abiertas.
// `reversadas`: líneas de esta devolución que hoy están como no entregadas en su despacho; `deEstaDevolucion` =
// la última reversa de esa línea la creó esta devolución.
export function efectoDeAnular(input: {
  devolucion: { closedAt: Date | null; annulledAt: Date | null; dispatchStatusBefore: DispatchStatusKey | null };
  dispatchStatus: DispatchStatusKey | null;
  orderItemIds: string[];
  otrosDespachos: { code: string; status: DispatchStatusKey; orderItemIds: string[] }[];
  reversadas: { orderItemId: string; deEstaDevolucion: boolean }[];
}): AnnulEffectResult {
  if (input.devolucion.annulledAt) return { ok: false, error: "Esta devolución ya está anulada." };
  if (input.devolucion.closedAt) return { ok: false, error: "Esta devolución está cerrada: no se puede anular." };

  if (input.dispatchStatus === "RETURNED" && input.devolucion.dispatchStatusBefore === "SHIPPED") {
    if (puedeVolverAEnviado(input)) return { ok: true, efecto: { tipo: "VOLVER_A_ENVIADO" } };
    const ids = new Set(input.orderItemIds);
    const otro = input.otrosDespachos.find(
      (d) => d.status !== "CANCELLED" && d.status !== "RETURNED" && d.orderItemIds.some((id) => ids.has(id)),
    );
    return {
      ok: false,
      error: `No se puede anular: esos productos ya salieron en otro despacho${otro ? ` (${otro.code})` : ""}. Cancélalo o ajústalo primero.`,
    };
  }

  if (input.dispatchStatus === "DELIVERED" && input.reversadas.length > 0) {
    return {
      ok: true,
      efecto: {
        tipo: "LIMPIAR_ENTREGA",
        orderItemIds: input.reversadas.filter((r) => r.deEstaDevolucion).map((r) => r.orderItemId),
        sinTocar: input.reversadas.filter((r) => !r.deEstaDevolucion).map((r) => r.orderItemId),
      },
    };
  }
  // RETURNED de antes, sin despacho o el despacho ya cambió: solo queda la anulación.
  return { ok: true, efecto: { tipo: "SOLO_ANULAR" } };
}

// Mensaje de WhatsApp para la asesora de la venta. Nunca lleva costos, fletes ni precios.
export function mensajeDevolucionAsesora(input: {
  asesora: string;
  orden: string;
  venta: string | null;
  cliente: string;
  productos: string[];
  motivo: string;
  dondeEsta: string;
  queSigue: string;
}): string {
  return [
    `Hola ${input.asesora}, te aviso de una devolución.`,
    `Orden: ${input.orden}${input.venta ? ` · Venta: ${input.venta}` : ""}`,
    `Cliente: ${input.cliente}`,
    `Productos: ${input.productos.join(", ")}`,
    `Motivo: ${input.motivo}`,
    `Dónde está: ${input.dondeEsta}`,
    `Qué sigue: ${input.queSigue}`,
  ].join("\n");
}

// ---- Vista «Devoluciones» (/admin/ordenes/devoluciones): filas, filtros, resumen y CSV. Puro. ----

export const SIN_DATO = "sin dato";
export const FALTA_REGISTRAR_LABEL = "Devuelta – falta registrar";

// Una fila por devolución (sin anular) o por despacho «Devuelto» sin registro (faltaRegistrar).
export type DevolucionFila = {
  id: string;
  orderId: string;
  orderCode: string;
  fecha: Date; // returnDate (fecha escrita) o, si falta registrar, la última actualización del despacho
  faltaRegistrar: boolean;
  abierta: boolean;
  productos: { nombre: string; cantidad: number }[];
  proveedoras: string[];
  transportadora: string;
  motivo: string; // etiqueta
  dondeEsta: string;
  queSigue: string;
  perdida: number;
};

export type FiltrosDevolucion = {
  mes: string | null; // AAAA-MM; null = todos los meses
  abiertas: boolean;
  motivo: string | null;
  producto: string | null;
  proveedora: string | null;
  transportadora: string | null;
};

const param = (value: string | string[] | undefined): string | null => {
  const v = (Array.isArray(value) ? value[0] : value)?.trim();
  return v ? v.slice(0, 200) : null;
};

export function parseFiltrosDevolucion(params: Record<string, string | string[] | undefined>): FiltrosDevolucion {
  const mes = param(params.mes);
  return {
    mes: mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes) ? mes : null,
    abiertas: param(params.abiertas) === "1",
    motivo: param(params.motivo),
    producto: param(params.producto),
    proveedora: param(params.proveedora),
    transportadora: param(params.transportadora),
  };
}

export function filtrarDevoluciones(filas: DevolucionFila[], f: FiltrosDevolucion): DevolucionFila[] {
  return filas
    .filter(
      (r) =>
        (!f.mes || colombiaMonthKey(r.fecha) === f.mes) &&
        (!f.abiertas || r.abierta) &&
        (!f.motivo || r.motivo === f.motivo) &&
        (!f.producto || r.productos.some((p) => p.nombre === f.producto)) &&
        (!f.proveedora || r.proveedoras.includes(f.proveedora)) &&
        (!f.transportadora || r.transportadora === f.transportadora),
    )
    .sort((a, b) => b.fecha.getTime() - a.fecha.getTime() || b.orderCode.localeCompare(a.orderCode));
}

export type ConteoDevolucion = { clave: string; cantidad: number };

const ordenar = (map: Map<string, number>): ConteoDevolucion[] =>
  [...map.entries()].map(([clave, cantidad]) => ({ clave, cantidad })).sort((a, b) => b.cantidad - a.cantidad || a.clave.localeCompare(b.clave, "es"));

// Conteo, pérdida informativa total y agrupaciones. Por producto cuenta unidades; lo demás, devoluciones.
export function resumenDevoluciones(filas: DevolucionFila[]) {
  const porMotivo = new Map<string, number>();
  const porProducto = new Map<string, number>();
  const porProveedora = new Map<string, number>();
  const porTransportadora = new Map<string, number>();
  const sumar = (map: Map<string, number>, clave: string, n = 1) => map.set(clave, (map.get(clave) ?? 0) + n);
  for (const r of filas) {
    sumar(porMotivo, r.motivo);
    for (const p of r.productos) sumar(porProducto, p.nombre, p.cantidad);
    for (const proveedora of new Set(r.proveedoras)) sumar(porProveedora, proveedora);
    sumar(porTransportadora, r.transportadora);
  }
  return {
    cantidad: filas.length,
    abiertas: filas.filter((r) => r.abierta).length,
    perdidaTotal: roundMoney(filas.reduce((sum, r) => sum + r.perdida, 0)),
    porMotivo: ordenar(porMotivo),
    porProducto: ordenar(porProducto),
    porProveedora: ordenar(porProveedora),
    porTransportadora: ordenar(porTransportadora),
  };
}

// Opciones de los filtros (de todas las filas, sin filtrar).
export function opcionesDeFiltros(filas: DevolucionFila[]) {
  const unicos = (values: string[]) => [...new Set(values)].sort((a, b) => a.localeCompare(b, "es"));
  return {
    motivos: unicos(filas.map((r) => r.motivo)),
    productos: unicos(filas.flatMap((r) => r.productos.map((p) => p.nombre))),
    proveedoras: unicos(filas.flatMap((r) => r.proveedoras)),
    transportadoras: unicos(filas.map((r) => r.transportadora)),
  };
}

export const productosDeFila = (r: DevolucionFila) => r.productos.map((p) => `${p.nombre} × ${p.cantidad}`).join(", ");
export const estadoDeFila = (r: DevolucionFila) => (r.faltaRegistrar ? FALTA_REGISTRAR_LABEL : r.abierta ? "Abierta" : "Cerrada");

// CSV (";" y BOM, como el de retenciones) con lo mismo que la tabla.
export function devolucionesCsv(filas: DevolucionFila[]): string {
  const header = ["Fecha", "Orden", "Estado", "Producto", "Proveedora", "Transportadora", "Motivo", "Dónde está", "Qué sigue", "Pérdida"];
  const lines = filas.map((r) =>
    [
      colombiaDayKey(r.fecha),
      displayCode(r.orderCode),
      estadoDeFila(r),
      productosDeFila(r),
      r.proveedoras.join(", "),
      r.transportadora,
      r.motivo,
      r.dondeEsta,
      r.queSigue,
      String(roundMoney(r.perdida)),
    ]
      .map(csvCell)
      .join(";"),
  );
  const total = roundMoney(filas.reduce((sum, r) => sum + r.perdida, 0));
  lines.push(["", "", "", "", "", "", "", "", "Total", String(total)].map(csvCell).join(";"));
  const bom = "\ufeff";
  return `${bom}${[header.map(csvCell).join(";"), ...lines].join("\r\n")}\r\n`;
}
