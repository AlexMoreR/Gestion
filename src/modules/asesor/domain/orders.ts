// Pedidos para el asesor de IA (buscar_pedido y pedidos_abiertos). Reglas puras, sin Prisma.
// "Pedido" = una venta (SAL) no cancelada con su orden de venta. Solo lectura.
import { bogotaDay, buildSaleLedger, describeLedgerDates, matchesText, type SaleLedger } from "./payments";
import type { OrderTracking } from "./entities";

export const MAX_ORDER_RESULTS = 10;
export const NO_DATA = "sin dato";

// Estado de la orden en palabras (el de la venta si aun no hay orden).
const STATUS_WORDS: Record<string, string> = {
  DRAFT: "por fabricar",
  RELEASED: "por fabricar",
  IN_PRODUCTION: "en fabricación",
  READY_FOR_DISPATCH: "listo para despacho",
  DISPATCHED: "despachado",
  COMPLETED: "entregado",
  CANCELLED: "cancelado",
};

// Devolución (mismo cálculo que la etiqueta de la orden): se agrega al estado en palabras.
const RETURN_WORDS: Record<string, string> = {
  DEVUELTA: "devuelta",
  PARCIAL: "devolución parcial",
  FALTA_REGISTRAR: "devuelta, falta registrar",
};

const day = (date: Date | null | undefined) => (date ? bogotaDay(date) : null);

// Estado del pedido con su fecha: la ultima vez que la orden paso a ese estado en el historial.
export function describeOrderStatus(order: OrderTracking, ledger: SaleLedger) {
  const status = ledger.input.orderStatus;
  if (!status) {
    return { estado: "sin orden (falta crear la orden)", fecha_estado: null };
  }
  const lastChange = [...order.statusChanges]
    .filter((change) => change.toStatus === status)
    .sort((left, right) => right.at.getTime() - left.at.getTime())[0]?.at;
  let fecha: Date | null = lastChange ?? null;
  // Entregado: misma fecha de entrega que Balances. Por fabricar sin historial: cuando se creo la orden.
  if (status === "COMPLETED") fecha = ledger.input.deliveredAt ?? fecha;
  if (!fecha && (status === "DRAFT" || status === "RELEASED")) fecha = order.orderCreatedAt;
  if (!fecha && status === "DISPATCHED") {
    const shipped = order.dispatches.flatMap((dispatch) => (dispatch.shippedAt ? [dispatch.shippedAt] : []));
    fecha = shipped.sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
  }
  const estado = STATUS_WORDS[status] ?? status;
  const devolucion = order.devolucion && status !== "CANCELLED" ? RETURN_WORDS[order.devolucion] : null;
  return { estado: devolucion ? `${estado} · ${devolucion}` : estado, fecha_estado: day(fecha) };
}

// Abierto = no entregado ni cancelado.
export function isOpenOrder(ledger: SaleLedger): boolean {
  return !ledger.cancelled && ledger.input.orderStatus !== "COMPLETED";
}

const CODE_PATTERN = /^(SAL|ORD|OF|COT)?-?0*(\d{1,6})$/i;

function codeNumber(code: string | null | undefined, prefix: string): number | null {
  const match = new RegExp(`^${prefix}-0*(\\d+)$`, "i").exec(code ?? "");
  return match ? Number(match[1]) : null;
}

function orderCodes(order: OrderTracking): Array<[string, string | null]> {
  return [
    ["SAL", order.ledger.saleCode],
    ["ORD", order.orderCode],
    ["COT", order.ledger.quoteCode],
    ...order.manufacturingOrders.map((of): [string, string] => ["OF", of.code]),
  ];
}

const digitsOf = (text: string | null | undefined) => (text ?? "").replace(/\D/g, "");

// Coincide por codigo (SAL/ORD/OF/COT, con o sin ceros; un numero solo busca en todos),
// por telefono (7 o mas digitos) o por palabras: cada palabra debe aparecer en
// clienta, ciudad, departamento o productos (sin tildes ni mayusculas).
export function matchesOrder(order: OrderTracking, text: string): boolean {
  const search = text.trim().replace(/\s+/g, " ");
  if (!search) return false;
  const digits = digitsOf(search);
  if (/^[\d\s()+-]+$/.test(search) && digits.length >= 7) {
    return digitsOf(order.clientPhone).includes(digits);
  }
  const code = CODE_PATTERN.exec(search.replace(/\s/g, ""));
  if (code) {
    const prefix = code[1]?.toUpperCase() ?? null;
    const number = Number(code[2]);
    return orderCodes(order).some(([kind, value]) => (!prefix || kind === prefix) && codeNumber(value, kind) === number);
  }
  const haystack = [
    order.ledger.clientName,
    order.city,
    order.department,
    ...order.products.map((product) => product.nombre),
  ].join(" | ");
  return search.split(" ").every((word) => matchesText(haystack, word));
}

// Mas reciente primero (fecha de creacion de la venta).
export function sortNewestFirst<T extends { ledger: { saleCreatedAt: Date; saleCode: string } }>(orders: T[]): T[] {
  return [...orders].sort(
    (left, right) =>
      right.ledger.saleCreatedAt.getTime() - left.ledger.saleCreatedAt.getTime() ||
      right.ledger.saleCode.localeCompare(left.ledger.saleCode),
  );
}

// Un pedido como lo ve Claude: codigos, clienta y ciudad, productos, plata y estado.
export function describeOrder(order: OrderTracking, ledger: SaleLedger = buildSaleLedger(order.ledger)) {
  const money = describeLedgerDates(ledger);
  return {
    venta: order.ledger.saleCode,
    orden: order.orderCode,
    cotizacion: order.ledger.quoteCode,
    fecha_venta: bogotaDay(order.ledger.saleCreatedAt),
    cliente: order.ledger.clientName,
    telefono: order.clientPhone,
    ciudad: order.city?.trim() || NO_DATA,
    departamento: order.department?.trim() || NO_DATA,
    productos: order.products,
    vendedora: order.ledger.sellerName ?? NO_DATA,
    total: order.ledger.total,
    pagado: money.pagado,
    saldo_pendiente: money.saldo_pendiente,
    forma_de_pago: money.forma_de_pago,
    contraentrega: order.ledger.paymentMethod === "CONTRAENTREGA",
    proveedoras: order.manufacturingOrders.map((of) => ({ proveedora: of.supplierName, of: of.code })),
    ...describeOrderStatus(order, ledger),
    despachos: order.dispatches.map((dispatch) => ({
      despacho: dispatch.code,
      transportador: dispatch.carrierName?.trim() || null,
      guia: dispatch.trackingNumber?.trim() || null,
      direccion: dispatch.shippingAddress?.trim() || null,
      fecha_despacho: day(dispatch.shippedAt),
      fecha_entrega: day(dispatch.deliveredAt),
    })),
    fecha_pago_completo: money.fecha_pago_completo,
    fecha_entrega: money.fecha_entrega,
  };
}

const hasCity = (order: OrderTracking) => Boolean(order.city?.trim());

// buscar_pedido: coincidencias no canceladas, mas reciente primero, maximo 10.
export function findOrders(orders: OrderTracking[], text: string) {
  const matches = sortNewestFirst(
    orders
      .map((order) => ({ ...order, built: buildSaleLedger(order.ledger) }))
      .filter((order) => !order.built.cancelled && matchesOrder(order, text)),
  );
  const shown = matches.slice(0, MAX_ORDER_RESULTS);
  return {
    busqueda: text.trim(),
    coincidencias: matches.length,
    mostrados: shown.length,
    sin_ciudad: shown.filter((order) => !hasCity(order)).length,
    pedidos: shown.map((order) => describeOrder(order, order.built)),
  };
}

// pedidos_abiertos: todos los no entregados ni cancelados (sin tope), mas reciente primero.
export function listOpenOrders(orders: OrderTracking[]) {
  const open = sortNewestFirst(
    orders.map((order) => ({ ...order, built: buildSaleLedger(order.ledger) })).filter((order) => isOpenOrder(order.built)),
  );
  return {
    total: open.length,
    sin_ciudad: open.filter((order) => !hasCity(order)).length,
    pedidos: open.map((order) => describeOrder(order, order.built)),
  };
}
