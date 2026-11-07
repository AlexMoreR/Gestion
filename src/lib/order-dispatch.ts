// Reglas puras del despacho de productos de una orden (colectivo o individual).
// Sin Prisma: las usan la pantalla de la orden y las acciones de despacho.

export type DispatchableItem = {
  id: string;
  name: string;
  // Listo para salir: confirmado y, si es de fabricación, recogido (pago + foto).
  ready: boolean;
  // Ya pertenece a un despacho activo (no cancelado ni devuelto).
  dispatched: boolean;
};

// Separa lo elegido en lo que sale en este despacho y lo que queda fuera (aún sin recoger).
// Lo ya despachado no entra en ninguna de las dos listas.
export function splitDispatchSelection<T extends DispatchableItem>(
  items: T[],
  selectedIds: Iterable<string>,
): { toDispatch: T[]; leftOut: T[] } {
  const selected = new Set(selectedIds);
  const pending = items.filter((item) => selected.has(item.id) && !item.dispatched);
  return {
    toDispatch: pending.filter((item) => item.ready),
    leftOut: pending.filter((item) => !item.ready),
  };
}

// Productos de la orden que aún no salen en ningún despacho activo.
export function missingDispatchItems<T extends { id: string }>(
  items: T[],
  dispatchedItemIds: Iterable<string>,
): T[] {
  const dispatched = new Set(dispatchedItemIds);
  return items.filter((item) => !dispatched.has(item.id));
}

// La orden pasa a Despachada solo con TODOS sus productos en algún despacho activo.
export function isOrderFullyDispatched(
  items: { id: string }[],
  dispatchedItemIds: Iterable<string>,
): boolean {
  return items.length > 0 && missingDispatchItems(items, dispatchedItemIds).length === 0;
}

// Mensaje al terminar un despacho: cuántos salieron y cuáles faltan por despachar.
export function dispatchResultMessage(dispatchedCount: number, missingNames: string[]): string {
  const head =
    dispatchedCount === 1 ? "Despachado 1 producto" : `Despachados ${dispatchedCount} productos`;
  return missingNames.length > 0 ? `${head} · Faltan por despachar: ${missingNames.join(", ")}` : head;
}

type DispatchForDelivery = {
  id: string;
  status: string;
  createdAt: Date;
  itemCount: number;
};

const INACTIVE = new Set(["CANCELLED", "RETURNED"]);

// Despacho al que apunta «Registrar entrega» de la orden: el más viejo activo sin entregar.
// Si todos están entregados, el último entregado (para poder deshacer la entrega).
export function dispatchToDeliver(dispatches: DispatchForDelivery[]): string | null {
  const active = dispatches
    .filter((dispatch) => !INACTIVE.has(dispatch.status))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const pending = active.find((dispatch) => dispatch.status !== "DELIVERED");
  return (pending ?? active[active.length - 1])?.id ?? null;
}

// Paso «Entregar» completo: todos los productos despachados y todo despacho activo entregado.
// Órdenes viejas cuyos despachos no tienen productos ligados: basta el último despacho entregado.
export function isOrderDeliveryDone(input: {
  allItemsDispatched: boolean;
  dispatches: DispatchForDelivery[];
}): boolean {
  const active = input.dispatches.filter((dispatch) => !INACTIVE.has(dispatch.status));
  if (active.length === 0) return false;
  if (active.every((dispatch) => dispatch.itemCount === 0)) {
    const latest = [...active].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    return latest.status === "DELIVERED";
  }
  return input.allItemsDispatched && active.every((dispatch) => dispatch.status === "DELIVERED");
}

// Etiqueta de pendientes de la orden: muestra todo lo que falta, no solo la primera etapa.
export function pendingItemsLabel(counts: { fabricar: number; recoger: number; despachar: number }): string {
  const parts = (
    [
      ["fabricar", counts.fabricar],
      ["recoger", counts.recoger],
      ["despachar", counts.despachar],
    ] as const
  ).filter(([, n]) => n > 0);
  if (parts.length === 0) return "Despachado";
  if (parts.length === 1) {
    const [stage, n] = parts[0];
    return `Pendiente ${stage} ${n} producto${n === 1 ? "" : "s"}`;
  }
  return `Pendiente ${parts.map(([stage, n]) => `${stage} ${n}`).join(" · ")}`;
}

// Por qué un producto no puede salir aún (mismas reglas del servidor). null = listo.
// En una compra el item ya viene comprado; uno de stock solo debe estar confirmado.
export function dispatchBlocker(
  item: {
    fulfillmentMode: string;
    confirmedAt: Date | null;
    confirmedSupplierId: string | null;
    hasPurchaseCost: boolean;
    photoCount: number;
    supplierPaymentStatus: string | null;
  },
  isPurchaseOrder: boolean,
): string | null {
  if (isPurchaseOrder) return null;
  if (item.fulfillmentMode === "STOCK") {
    return item.confirmedAt === null ? "falta confirmar la salida de stock" : null;
  }
  if (!item.confirmedSupplierId || !item.hasPurchaseCost) return "falta confirmar proveedor y costo (Fabricando)";
  if (item.photoCount === 0) return "sin recoger: falta la foto del producto terminado";
  if (item.supplierPaymentStatus === null) return "sin recoger: falta registrar el pago al proveedor";
  return null;
}

// Revisión de órdenes afectadas (solo lectura, script ordenes:revisar-despachos):
// - "despachada_incompleta": Despachada o Cerrada con productos sin despacho activo.
// - "recogido_sin_salir": un producto ya salió y otro Recogido sigue sin despachar.
// Órdenes cuyos despachos activos no tienen productos ligados (viejas) no se juzgan.
export type DispatchGap = "despachada_incompleta" | "recogido_sin_salir";

export function dispatchGaps(input: {
  orderStatus: string;
  items: { id: string; ready: boolean }[];
  dispatchedItemIds: string[];
}): { gaps: DispatchGap[]; missingIds: string[]; readyNotDispatchedIds: string[] } {
  const missing = missingDispatchItems(input.items, input.dispatchedItemIds);
  const gaps: DispatchGap[] = [];
  if (input.orderStatus === "CANCELLED" || input.dispatchedItemIds.length === 0) {
    return { gaps, missingIds: [], readyNotDispatchedIds: [] };
  }
  const readyNotDispatched = missing.filter((item) => item.ready);
  if ((input.orderStatus === "DISPATCHED" || input.orderStatus === "COMPLETED") && missing.length > 0) {
    gaps.push("despachada_incompleta");
  }
  if (readyNotDispatched.length > 0) gaps.push("recogido_sin_salir");
  return {
    gaps,
    missingIds: missing.map((item) => item.id),
    readyNotDispatchedIds: readyNotDispatched.map((item) => item.id),
  };
}

// Huella de qué productos están confirmados. La ficha de la orden la usa como `key`
// de la tabla: al confirmar (Fabricar/Confirmar, uno o varios) la tabla se reinicia,
// se cierran los cuadros y no se encadena solo el de Recoger.
export function confirmationKey(items: { id: string; isConfirmed: boolean }[]): string {
  return items.filter((item) => item.isConfirmed).map((item) => item.id).join(",");
}
