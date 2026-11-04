// Puertos del recibo de caja sobre Prisma: lee la venta (cliente, productos, asesora, orden, abonos)
// y guarda en cada abono si el recibo se mandó. No cambia montos ni estados de la venta.
import { prisma } from "@/lib/prisma";
import type { ReciboCajaPuertos } from "../application/enviar-recibo-caja";

export const prismaReciboCajaPuertos: ReciboCajaPuertos = {
  async cargarVenta(saleId) {
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: {
        code: true,
        total: true,
        client: { select: { name: true, phone: true } },
        // "Asesora" = quien creó la cotización (así define Gestión a la vendedora).
        quote: {
          select: {
            origin: true,
            createdBy: { select: { name: true } },
            items: { select: { quantity: true, product: { select: { name: true } } } },
          },
        },
        order: { select: { status: true } },
        salePayments: {
          orderBy: { sortOrder: "asc" },
          select: { id: true, amount: true, paymentDate: true, createdAt: true, isWithholding: true },
        },
      },
    });
    if (!sale) return null;
    return {
      code: sale.code,
      total: Number(sale.total),
      clienteNombre: sale.client.name ?? "",
      clienteTelefono: sale.client.phone ?? "",
      productos: sale.quote.items.map((item) =>
        item.quantity > 1 ? `${item.quantity} x ${item.product.name}` : item.product.name,
      ),
      asesora: sale.quote.createdBy.name ?? "",
      orderStatus: sale.order?.status ?? null,
      esMostrador: sale.quote.origin === "MOSTRADOR",
      pagos: sale.salePayments.map((pago) => ({ ...pago, amount: Number(pago.amount) })),
    };
  },
  async marcar(abonoIds, estado, en) {
    await prisma.salePayment.updateMany({
      where: { id: { in: abonoIds } },
      data: { reciboCajaEstado: estado, reciboCajaEn: en },
    });
  },
};
