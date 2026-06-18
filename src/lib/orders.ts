import type {
  DeliveryType,
  DispatchStatus,
  OrderStatus,
  ProductionJobStatus,
  ProductFulfillmentMode,
} from "@prisma/client";

const CODE_PATTERN = /^([A-Z]{3})-(\d+)$/;

function parseCodeNumber(code: string): number {
  const match = CODE_PATTERN.exec(code.trim());
  if (!match) {
    return 0;
  }

  const value = Number(match[2]);
  return Number.isFinite(value) ? value : 0;
}

function buildCode(prefix: string, index: number): string {
  return `${prefix}-${String(index).padStart(5, "0")}`;
}

export function parseOrderCodeNumber(code: string): number {
  return parseCodeNumber(code);
}

export function parseProductionJobCodeNumber(code: string): number {
  return parseCodeNumber(code);
}

export function parseDispatchCodeNumber(code: string): number {
  return parseCodeNumber(code);
}

export function buildOrderCode(index: number): string {
  return buildCode("ORD", index);
}

export function buildProductionJobCode(index: number): string {
  return buildCode("PRO", index);
}

export function buildDispatchCode(index: number): string {
  return buildCode("DSP", index);
}

export function getOrderStatusLabel(status: OrderStatus): string {
  switch (status) {
    case "DRAFT":
      return "Borrador";
    case "RELEASED":
      return "Liberada";
    case "IN_PRODUCTION":
      return "En producción";
    case "READY_FOR_DISPATCH":
      return "Lista para despacho";
    case "DISPATCHED":
      return "Despachada";
    case "COMPLETED":
      return "Cerrada";
    case "CANCELLED":
      return "Cancelada";
    default:
      return status;
  }
}

export function getProductionJobStatusLabel(status: ProductionJobStatus): string {
  switch (status) {
    case "PENDING":
      return "Pendiente";
    case "IN_PROGRESS":
      return "En proceso";
    case "PAUSED":
      return "Pausada";
    case "DONE":
      return "Terminada";
    case "CANCELLED":
      return "Cancelada";
    default:
      return status;
  }
}

export function getDispatchStatusLabel(status: DispatchStatus): string {
  switch (status) {
    case "PENDING":
      return "Pendiente";
    case "PACKING":
      return "Empacando";
    case "SHIPPED":
      return "Despachado";
    case "DELIVERED":
      return "Entregado";
    case "RETURNED":
      return "Devuelto";
    case "CANCELLED":
      return "Cancelado";
    default:
      return status;
  }
}

export function getDeliveryTypeLabel(type: DeliveryType): string {
  switch (type) {
    case "COUNTER":
      return "Mostrador (Cali)";
    case "PICKUP":
      return "Recoge en su local";
    case "SHIPPING":
      return "Envío a domicilio";
    default:
      return type;
  }
}

const GREEN_BADGE =
  "border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";
const AMBER_BADGE =
  "border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-400";

/**
 * Etiqueta y color del estado "real" de la orden de cara al usuario.
 * Distingue los dos cierres verdes que pidió el negocio:
 *   - "Cerrado – En envío": despachada por transportadora, aún no entregada.
 *   - "Cerrado – Entregado": el cliente ya recibió.
 * `delivery` es el despacho más reciente (o null si aún no se despacha).
 */
export function getOrderDisplayState(
  status: OrderStatus,
  delivery: { deliveryType: DeliveryType; status: DispatchStatus } | null,
): { label: string; className: string } {
  if (status === "COMPLETED") {
    return { label: "Cerrado – Entregado", className: GREEN_BADGE };
  }

  if (status === "DISPATCHED" && delivery) {
    if (delivery.deliveryType === "SHIPPING") {
      return { label: "Cerrado – En envío", className: GREEN_BADGE };
    }
    // Mostrador / Recoge: ya despachado, solo falta el registro de entrega.
    return { label: "Por entregar", className: AMBER_BADGE };
  }

  return {
    label: getOrderStatusLabel(status),
    className: getOrderStatusBadgeClassName(status),
  };
}

export function getFulfillmentModeLabel(mode: ProductFulfillmentMode): string {
  switch (mode) {
    case "STOCK":
      return "Stock";
    case "MANUFACTURE":
      return "Fabricación";
    case "MIXED":
      return "Mixto";
    default:
      return mode;
  }
}

export function getOrderStatusBadgeClassName(status: OrderStatus): string {
  switch (status) {
    case "DRAFT":
      return "border-border bg-muted text-muted-foreground";
    case "RELEASED":
      return "border-sky-500/30 bg-sky-500/15 text-sky-600 dark:text-sky-400";
    case "IN_PRODUCTION":
      return "border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-400";
    case "READY_FOR_DISPATCH":
      return "border-violet-500/30 bg-violet-500/15 text-violet-600 dark:text-violet-400";
    case "DISPATCHED":
      return "border-blue-500/30 bg-blue-500/15 text-blue-600 dark:text-blue-400";
    case "COMPLETED":
      return "border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";
    case "CANCELLED":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

export function getProductionJobStatusBadgeClassName(status: ProductionJobStatus): string {
  switch (status) {
    case "PENDING":
      return "border-border bg-muted text-muted-foreground";
    case "IN_PROGRESS":
      return "border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-400";
    case "PAUSED":
      return "border-sky-500/30 bg-sky-500/15 text-sky-600 dark:text-sky-400";
    case "DONE":
      return "border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";
    case "CANCELLED":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

export function getDispatchStatusBadgeClassName(status: DispatchStatus): string {
  switch (status) {
    case "PENDING":
      return "border-border bg-muted text-muted-foreground";
    case "PACKING":
      return "border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-400";
    case "SHIPPED":
      return "border-blue-500/30 bg-blue-500/15 text-blue-600 dark:text-blue-400";
    case "DELIVERED":
      return "border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";
    case "RETURNED":
      return "border-violet-500/30 bg-violet-500/15 text-violet-600 dark:text-violet-400";
    case "CANCELLED":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}
