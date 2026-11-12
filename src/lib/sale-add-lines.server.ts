// Agregar productos a una cotización que ya es venta (nov-2026). Las líneas viejas no se tocan: se crean
// las nuevas en la cotización y en la orden (un combo, sus piezas, como al crear la orden), y suben los
// totales de la cotización, la venta y la orden. El estado de la venta sale de lo pagado.
// No es server action: la llama adminUpdateQuoteFullAction.
import "server-only";
import { Prisma, type ProductFulfillmentMode } from "@prisma/client";
import { getActivityActor, logActivityTx } from "@/lib/activity-log";
import { displayCode } from "@/lib/code-display";
import { expandQuoteItemToOrderItems } from "@/lib/order-items";
import { prisma } from "@/lib/prisma";
import { parseQuoteItemMeta } from "@/lib/quote-item-meta";
import { saleStatusForPaid } from "@/modules/ventas/domain/sale-paid-status";

type LineaNueva = {
  productId: string;
  supplierId: string | null;
  quantity: number;
  unitPrice: number;
  fulfillmentMode: ProductFulfillmentMode;
  lineTotal: number;
  notes: string | null;
};

const cop = (valor: number) => `$${Math.round(valor).toLocaleString("es-CO")}`;

/** Devuelve el mensaje para la pantalla. */
export async function agregarLineasAVenta(input: {
  quoteId: string;
  quoteCode: string;
  sale: {
    id: string;
    code: string;
    status: Prisma.SaleGetPayload<object>["status"];
    total: Prisma.Decimal;
    subtotal: Prisma.Decimal;
    downPaymentAmount: Prisma.Decimal;
    order: { id: string; code: string; status: string; subtotal: Prisma.Decimal } | null;
  };
  lineas: LineaNueva[];
  datosCotizacion: Prisma.QuoteUncheckedUpdateInput;
}): Promise<string> {
  const actor = await getActivityActor();
  const monto = Math.round(input.lineas.reduce((suma, linea) => suma + linea.lineTotal, 0) * 100) / 100;
  const nuevoTotal = Math.round((Number(input.sale.total) + monto) * 100) / 100;
  const pagado = Number(input.sale.downPaymentAmount);

  const nombres = await prisma.$transaction(async (tx) => {
    const productos = await tx.product.findMany({
      where: { id: { in: input.lineas.map((linea) => linea.productId) } },
      include: { bundleComponents: { orderBy: { sortOrder: "asc" }, include: { child: true } } },
    });
    const productoDe = new Map(productos.map((producto) => [producto.id, producto]));

    await tx.quote.update({
      where: { id: input.quoteId },
      data: { ...input.datosCotizacion, subtotal: { increment: monto }, total: { increment: monto } },
    });
    const creadas = [];
    for (const linea of input.lineas) {
      creadas.push(
        await tx.quoteItem.create({
          data: {
            quoteId: input.quoteId,
            productId: linea.productId,
            supplierId: linea.supplierId,
            quantity: linea.quantity,
            unitPrice: new Prisma.Decimal(linea.unitPrice),
            fulfillmentMode: linea.fulfillmentMode,
            lineTotal: new Prisma.Decimal(linea.lineTotal),
            notes: linea.notes,
          },
        }),
      );
    }

    await tx.sale.update({
      where: { id: input.sale.id },
      data: {
        total: new Prisma.Decimal(nuevoTotal),
        subtotal: new Prisma.Decimal(Number(input.sale.subtotal) + monto),
        status: saleStatusForPaid(pagado, nuevoTotal, input.sale.status),
      },
    });

    // La orden recibe las piezas nuevas (sin confirmar), igual que al crearla desde la venta.
    const order = input.sale.order;
    if (order) {
      for (const quoteItem of creadas) {
        const producto = productoDe.get(quoteItem.productId);
        if (!producto) continue;
        const piezas = expandQuoteItemToOrderItems({
          id: quoteItem.id,
          productId: quoteItem.productId,
          quantity: quoteItem.quantity,
          unitPrice: Number(quoteItem.unitPrice),
          lineTotal: Number(quoteItem.lineTotal),
          fulfillmentMode: quoteItem.fulfillmentMode,
          notes: quoteItem.notes,
          product: {
            name: producto.name,
            isBundle: producto.isBundle,
            bundleComponents: producto.bundleComponents.map((component) => ({
              quantity: component.quantity,
              child: { id: component.child.id, name: component.child.name, code: component.child.code, price: Number(component.child.price) },
            })),
          },
        });
        await tx.orderItem.createMany({ data: piezas.map((pieza) => ({ ...pieza, orderId: order.id })) });
      }
      await tx.order.update({
        where: { id: order.id },
        data: {
          total: new Prisma.Decimal(nuevoTotal),
          subtotal: new Prisma.Decimal(Number(order.subtotal) + monto),
        },
      });
    }

    // Un combo se nombra una vez (sus piezas comparten comboKey).
    const vistos = new Set<string>();
    const lista: string[] = [];
    for (const quoteItem of creadas) {
      const meta = parseQuoteItemMeta(quoteItem.notes);
      const clave = meta.comboKey || quoteItem.id;
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      lista.push(meta.comboName || productoDe.get(quoteItem.productId)?.name || "Producto");
    }
    const texto = `Agregó ${lista.join(", ")} (${cop(monto)}). Total de la venta: ${cop(nuevoTotal)}`;
    if (order) await tx.orderNote.create({ data: { orderId: order.id, text: texto, createdById: actor.id } });
    await logActivityTx(tx, actor, {
      action: "UPDATE",
      entityType: "SALE",
      entityId: input.sale.id,
      entityCode: input.sale.code,
      summary: `${texto} (${input.quoteCode}${order ? ` · ${order.code}` : ""})`,
      before: { ventaTotal: Number(input.sale.total), ventaEstado: input.sale.status },
      after: { ventaTotal: nuevoTotal, monto, quoteItemIds: creadas.map((item) => item.id) },
    });
    return lista;
  });

  const enOrden = input.sale.order ? ` y a la orden ${displayCode(input.sale.order.code)}` : "";
  return `Se agregó ${nombres.join(", ")} a la venta ${displayCode(input.sale.code)}${enOrden}. La venta subió ${cop(monto)}.`;
}
