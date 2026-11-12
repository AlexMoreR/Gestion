import "server-only";
import { prisma } from "@/lib/prisma";
import { agruparCanceladas, type LineaCancelada } from "@/lib/lineas-canceladas";

/** Productos cancelados de una venta, como los ve la clienta (líneas de su cotización). */
export async function canceladasDeVenta(saleCode: string | null | undefined): Promise<LineaCancelada[]> {
  if (!saleCode) return [];
  const copias = await prisma.registroAnulado.findMany({
    where: { tabla: "QuoteItem", codigo: saleCode },
    select: { datos: true, motivo: true, anuladoEn: true, monto: true },
  });
  return agruparCanceladas(copias);
}

/** Productos cancelados de una orden (piezas de la orden). */
export async function canceladasDeOrden(orderCode: string): Promise<LineaCancelada[]> {
  const copias = await prisma.registroAnulado.findMany({
    where: { tabla: "OrderItem", codigo: orderCode },
    select: { datos: true, motivo: true, anuladoEn: true, monto: true },
  });
  return agruparCanceladas(copias);
}
