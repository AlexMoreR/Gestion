import "server-only";

import { prisma } from "@/lib/prisma";
import { hasPayments, motivoDeCancelacion, ultimaCancelacion, type CanceladaFila } from "@/lib/order-cancellation";

const nombre = (u: { name: string | null; email: string } | null | undefined) => u?.name?.trim() || u?.email || "Sin dato";

// Filas de la vista «Canceladas»: las órdenes de venta CANCELLED (las reactivadas ya no salen). Solo lectura.
export async function listCanceladaFilas(): Promise<CanceladaFila[]> {
  const persona = { select: { name: true, email: true } } as const;
  const orders = await prisma.order.findMany({
    where: { type: "SALE", status: "CANCELLED" },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      code: true,
      updatedAt: true,
      client: persona,
      quote: { select: { createdBy: persona } },
      sale: {
        select: {
          code: true,
          downPaymentAmount: true,
          client: persona,
          quote: { select: { createdBy: persona } },
          salePayments: { select: { id: true } },
        },
      },
      items: { select: { quantity: true, product: { select: { name: true } } } },
      history: {
        where: { toStatus: "CANCELLED" },
        select: { fromStatus: true, toStatus: true, createdAt: true, note: true, changedBy: persona },
      },
    },
  });

  // Bitácora de las cancelaciones (respaldo del motivo, de quién y de cuándo): la más reciente por orden.
  const logs = await prisma.activityLog.findMany({
    where: { entityId: { in: orders.map((o) => o.id) }, action: "DELETE", summary: { startsWith: "Canceló la orden" } },
    orderBy: { createdAt: "desc" },
    select: { entityId: true, after: true, createdAt: true, actorName: true },
  });
  const logPorOrden = new Map<string, (typeof logs)[number]>();
  for (const log of logs) if (log.entityId && !logPorOrden.has(log.entityId)) logPorOrden.set(log.entityId, log);

  return orders.map((order) => {
    const hist = ultimaCancelacion(order.history);
    const log = logPorOrden.get(order.id);
    return {
      orderId: order.id,
      orderCode: order.code,
      saleCode: order.sale?.code ?? null,
      clienta: nombre(order.client ?? order.sale?.client),
      productos: order.items.map((i) => `${i.quantity} × ${i.product.name}`).join(", ") || "Sin dato",
      asesora: nombre(order.sale?.quote.createdBy ?? order.quote?.createdBy),
      motivo: motivoDeCancelacion(hist?.note, log?.after),
      canceladoPor: hist ? nombre(hist.changedBy) : log?.actorName?.trim() || "Sin dato",
      fecha: hist?.createdAt ?? log?.createdAt ?? order.updatedAt,
      tieneCobros: hasPayments(order.sale),
    };
  });
}
