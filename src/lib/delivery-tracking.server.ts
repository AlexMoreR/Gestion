import "server-only";
import { prisma } from "@/lib/prisma";
import {
  cumplimientoPorProveedor,
  resumirSeguimiento,
  type CumplimientoProveedor,
  type EntregaParaCumplimiento,
  type ResumenSeguimiento,
} from "@/lib/delivery-tracking";

export type SeguimientoPanel = {
  resumen: ResumenSeguimiento;
  fabricacion: CumplimientoProveedor[];
  transporte: CumplimientoProveedor[];
};

const DIAS_CUMPLIMIENTO = 90;
// shortcut: solo las 500 órdenes abiertas más viejas; con más, los contadores se quedan cortos. Subir el tope o contar en SQL si pasa.
const MAX_ORDENES_ABIERTAS = 500;

// Datos de la tarjeta "Seguimiento de entregas y fabricaciones" del panel /admin. Solo lectura.
export async function cargarSeguimiento(ahora: Date): Promise<SeguimientoPanel> {
  const desde = new Date(ahora.getTime() - DIAS_CUMPLIMIENTO * 24 * 60 * 60 * 1000);
  const rango = { gte: desde, lte: ahora };

  const [ordenes, ofs, despachos] = await Promise.all([
    prisma.order.findMany({
      where: { type: "SALE", status: { notIn: ["COMPLETED", "CANCELLED"] } },
      orderBy: { createdAt: "asc" },
      take: MAX_ORDENES_ABIERTAS,
      select: {
        id: true,
        code: true,
        status: true,
        client: { select: { name: true, email: true } },
        dispatches: {
          select: {
            status: true,
            estimatedDeliveryAt: true,
            deliveredAt: true,
            carrierName: true,
            carrierSupplier: { select: { name: true } },
          },
        },
        manufacturingOrders: { select: { supplierId: true, estimatedDeliveryAt: true, receivedAt: true } },
        items: {
          select: {
            confirmedSupplierId: true,
            fulfillmentMode: true,
            confirmedSupplier: { select: { name: true } },
            dispatchItems: { select: { dispatch: { select: { status: true } } } },
          },
        },
      },
    }),
    prisma.manufacturingOrder.findMany({
      where: { receivedAt: rango, estimatedDeliveryAt: { not: null } },
      select: {
        supplierId: true,
        estimatedDeliveryAt: true,
        receivedAt: true,
        supplier: { select: { name: true } },
      },
    }),
    // shortcut: un despacho con varios tramos (DispatchShippingLeg) lleva una sola fecha y se le atribuye a la
    // transportadora principal (carrierSupplierId = tramo 0); los demás tramos no se miden. Medirlos exige una
    // fecha por tramo.
    prisma.dispatch.findMany({
      where: {
        status: "DELIVERED",
        deliveredAt: rango,
        estimatedDeliveryAt: { not: null },
        carrierSupplierId: { not: null },
      },
      select: {
        carrierSupplierId: true,
        estimatedDeliveryAt: true,
        deliveredAt: true,
        carrierSupplier: { select: { name: true } },
      },
    }),
  ]);

  const resumen = resumirSeguimiento(
    ordenes.map((orden) => {
      const proveedoras: Record<string, string> = {};
      for (const item of orden.items) {
        if (item.confirmedSupplierId && item.confirmedSupplier) proveedoras[item.confirmedSupplierId] = item.confirmedSupplier.name;
      }
      return {
        orderId: orden.id,
        codigo: orden.code,
        cliente: orden.client?.name || orden.client?.email || "—",
        orderStatus: orden.status,
        despachos: orden.dispatches,
        transportadoras: orden.dispatches.map((d) => d.carrierSupplier?.name ?? (d.carrierName || null)),
        productos: orden.items.map((item) => ({
          confirmedSupplierId: item.confirmedSupplierId,
          fulfillmentMode: item.fulfillmentMode,
          dispatchStatuses: item.dispatchItems.map((row) => row.dispatch.status),
        })),
        ofs: orden.manufacturingOrders,
        proveedoras,
      };
    }),
    ahora,
  );

  const entregas: EntregaParaCumplimiento[] = [
    ...ofs.map((of) => ({
      proveedorId: of.supplierId,
      nombre: of.supplier.name,
      tipo: "FABRICACION" as const,
      estimadoEn: of.estimatedDeliveryAt,
      realEn: of.receivedAt,
    })),
    ...despachos.map((d) => ({
      proveedorId: d.carrierSupplierId as string,
      nombre: d.carrierSupplier?.name ?? "—",
      tipo: "TRANSPORTE" as const,
      estimadoEn: d.estimatedDeliveryAt,
      realEn: d.deliveredAt,
    })),
  ];
  const cumplimiento = cumplimientoPorProveedor(entregas);

  return {
    resumen,
    fabricacion: cumplimiento.filter((fila) => fila.tipo === "FABRICACION"),
    transporte: cumplimiento.filter((fila) => fila.tipo === "TRANSPORTE"),
  };
}
