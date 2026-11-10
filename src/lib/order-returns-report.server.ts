import "server-only";

import { prisma } from "@/lib/prisma";
import {
  SIN_DATO,
  despachosFaltaRegistrar,
  estaAbierta,
  perdidaDevolucion,
  returnLocationLabel,
  returnNextStepLabel,
  returnReasonLabel,
  type DevolucionFila,
} from "@/lib/order-return";

// Filas de la vista «Devoluciones»: las devoluciones sin anular y los despachos «Devuelto» sin registro.
// Solo lectura.
export async function listDevolucionFilas(): Promise<DevolucionFila[]> {
  const dispatchSelect = {
    id: true,
    status: true,
    updatedAt: true,
    carrierName: true,
    carrierSupplier: { select: { name: true } },
    shippingCost: true,
    items: { select: { orderItemId: true, quantity: true, shippingCost: true } },
  } as const;
  const itemSelect = {
    id: true,
    quantity: true,
    product: { select: { name: true } },
    confirmedSupplier: { select: { name: true } },
  } as const;

  const [returns, ordersWithReturned] = await Promise.all([
    prisma.orderReturn.findMany({
      where: { annulledAt: null },
      orderBy: { returnDate: "desc" },
      include: {
        order: { select: { code: true } },
        carrierSupplier: { select: { name: true } },
        dispatch: { select: dispatchSelect },
        items: { select: { orderItemId: true, quantity: true, orderItem: { select: itemSelect } } },
      },
    }),
    prisma.order.findMany({
      where: { status: { not: "CANCELLED" }, dispatches: { some: { status: "RETURNED" } } },
      select: {
        id: true,
        code: true,
        items: { select: itemSelect },
        dispatches: { select: dispatchSelect },
        returns: { where: { annulledAt: null }, select: { dispatchId: true } },
      },
    }),
  ]);

  const carrierOf = (d: { carrierName: string | null; carrierSupplier: { name: string } | null } | null) =>
    d?.carrierSupplier?.name || d?.carrierName?.trim() || null;
  const lineasDe = (d: (typeof ordersWithReturned)[number]["dispatches"][number]) =>
    d.items.map((i) => ({ orderItemId: i.orderItemId, quantity: i.quantity, shippingCost: i.shippingCost }));
  const proveedorasDe = (items: { confirmedSupplier: { name: string } | null }[]) => [
    ...new Set(items.map((i) => i.confirmedSupplier?.name || SIN_DATO)),
  ];

  const filas: DevolucionFila[] = returns.map((r) => ({
    id: r.id,
    orderId: r.orderId,
    orderCode: r.order.code,
    fecha: r.returnDate,
    faltaRegistrar: false,
    abierta: estaAbierta(r),
    productos: r.items.map((i) => ({ nombre: i.orderItem.product.name, cantidad: i.quantity })),
    proveedoras: proveedorasDe(r.items.map((i) => i.orderItem)),
    transportadora: r.carrierSupplier?.name || r.carrierName?.trim() || carrierOf(r.dispatch) || SIN_DATO,
    motivo: r.reason === "OTRO" && r.reasonText ? `Otro: ${r.reasonText}` : returnReasonLabel(r.reason),
    dondeEsta: returnLocationLabel(r.location),
    queSigue: returnNextStepLabel(r.nextStep),
    perdida: perdidaDevolucion({
      despacho: r.dispatch ? { shippingCost: r.dispatch.shippingCost, lineas: lineasDe(r.dispatch) } : null,
      devueltas: r.items,
      returnFreight: r.returnFreight,
    }).total,
  }));

  for (const order of ordersWithReturned) {
    const faltan = new Set(
      despachosFaltaRegistrar({
        despachos: order.dispatches.map((d) => ({ id: d.id, status: d.status, orderItemIds: d.items.map((i) => i.orderItemId) })),
        despachosConDevolucion: order.returns.flatMap((r) => (r.dispatchId ? [r.dispatchId] : [])),
      }),
    );
    const itemById = new Map(order.items.map((item) => [item.id, item]));
    for (const d of order.dispatches.filter((dispatch) => faltan.has(dispatch.id))) {
      // Despacho viejo sin productos ligados: se toman los de la orden.
      const lineas =
        d.items.length > 0
          ? d.items.map((i) => ({ orderItemId: i.orderItemId, quantity: i.quantity }))
          : order.items.map((i) => ({ orderItemId: i.id, quantity: i.quantity }));
      const items = lineas.flatMap((l) => {
        const item = itemById.get(l.orderItemId);
        return item ? [{ item, quantity: l.quantity }] : [];
      });
      filas.push({
        id: `falta:${d.id}`,
        orderId: order.id,
        orderCode: order.code,
        fecha: d.updatedAt,
        faltaRegistrar: true,
        abierta: true,
        productos: items.map(({ item, quantity }) => ({ nombre: item.product.name, cantidad: quantity })),
        proveedoras: proveedorasDe(items.map(({ item }) => item)),
        transportadora: carrierOf(d) || SIN_DATO,
        motivo: "Falta registrar",
        dondeEsta: SIN_DATO,
        queSigue: SIN_DATO,
        perdida: perdidaDevolucion({
          despacho: { shippingCost: d.shippingCost, lineas: lineasDe(d) },
          devueltas: lineas,
          returnFreight: null,
        }).total,
      });
    }
  }

  return filas;
}
