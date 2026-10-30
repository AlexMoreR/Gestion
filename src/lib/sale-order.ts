import "server-only";
import { Prisma } from "@prisma/client";
import { buildOrderCode, parseOrderCodeNumber } from "@/lib/orders";
import { expandQuoteItemsToOrderItems } from "@/lib/order-items";
import { isRetiredUser } from "@/modules/equipo/infrastructure/prisma-team-repository";

// Crear la orden de venta (SALE) de una venta, sin formulario ni redirect: la usa
// el formulario de la venta y la reusan los flujos automaticos. No es server
// action a proposito (vive fuera de "use server", asi no queda expuesta sin permiso).

export type CreateSaleOrderMotivo =
  | "venta_no_encontrada"
  | "ya_tiene_orden"
  | "responsable_invalido"
  | "responsable_retirado";

export type CreateSaleOrderResult =
  | { ok: true; orderId: string; orderCode: string }
  | { ok: false; motivo: CreateSaleOrderMotivo };

export async function getNextOrderCode(tx: Prisma.TransactionClient): Promise<string> {
  const lastOrder = await tx.order.findFirst({
    select: { code: true },
    orderBy: { code: "desc" },
  });

  const baseCodeNumber = lastOrder ? parseOrderCodeNumber(lastOrder.code) : 0;
  const maxAttempts = 30;

  for (let offset = 0; offset < maxAttempts; offset += 1) {
    const code = buildOrderCode(baseCodeNumber + 1 + offset);
    const existing = await tx.order.findUnique({ where: { code }, select: { id: true } });
    if (!existing) {
      return code;
    }
  }

  throw new Error("Unable to allocate order code");
}

// Debe correr dentro de prisma.$transaction. Lanza solo ante errores inesperados.
export async function createSaleOrder(
  tx: Prisma.TransactionClient,
  input: { saleId: string; actorId: string; assigneeId?: string | null; internalNotes?: string | null },
): Promise<CreateSaleOrderResult> {
  const sale = await tx.sale.findUnique({
    where: { id: input.saleId },
    include: {
      order: true,
      quote: {
        include: {
          items: {
            include: {
              product: {
                include: {
                  bundleComponents: {
                    orderBy: { sortOrder: "asc" },
                    include: { child: true },
                  },
                },
              },
            },
          },
        },
      },
      client: true,
    },
  });

  if (!sale) {
    return { ok: false, motivo: "venta_no_encontrada" };
  }

  if (sale.order) {
    return { ok: false, motivo: "ya_tiene_orden" };
  }

  if (input.assigneeId) {
    const validAssigned = await tx.user.findFirst({
      where: {
        id: input.assigneeId,
        role: { in: ["ADMIN", "EMPLEADO"] },
      },
      select: { id: true },
    });

    if (!validAssigned) {
      return { ok: false, motivo: "responsable_invalido" };
    }
    if (await isRetiredUser(validAssigned.id)) {
      return { ok: false, motivo: "responsable_retirado" };
    }
  }

  const subtotal = Number(sale.total);
  const total = Number(sale.total);

  // Expande los combos en sus componentes para que la orden de fabricacion
  // muestre los subproductos reales y no el combo padre.
  const orderItemInputs = expandQuoteItemsToOrderItems(
    sale.quote.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      lineTotal: Number(item.lineTotal),
      fulfillmentMode: item.fulfillmentMode,
      notes: item.notes,
      product: {
        name: item.product.name,
        isBundle: item.product.isBundle,
        bundleComponents: item.product.bundleComponents.map((component) => ({
          quantity: component.quantity,
          child: {
            id: component.child.id,
            name: component.child.name,
            code: component.child.code,
            price: Number(component.child.price),
          },
        })),
      },
    })),
  );

  // El inventario de los productos "por stock" ya no se valida ni se descuenta al
  // crear la orden: la salida se registra cuando el operador confirma el item
  // (adminConfirmStockOrderItemAction), que es donde se valida el stock suficiente.

  const code = await getNextOrderCode(tx);
  const order = await tx.order.create({
    data: {
      code,
      saleId: sale.id,
      quoteId: sale.quoteId,
      clientId: sale.clientId,
      createdById: input.actorId,
      assignedToId: input.assigneeId || null,
      status: "RELEASED",
      notes: sale.quote.notes,
      internalNotes: input.internalNotes || null,
      committedAt: new Date(),
      releasedAt: new Date(),
      subtotal: new Prisma.Decimal(subtotal),
      total: new Prisma.Decimal(total),
      items: {
        create: orderItemInputs,
      },
    },
  });

  await tx.orderStatusHistory.create({
    data: {
      orderId: order.id,
      fromStatus: null,
      toStatus: "RELEASED",
      note: "Orden creada desde venta",
      changedById: input.actorId,
    },
  });

  // Las lineas "por stock" ya no descuentan inventario aqui: la salida se
  // registra cuando el operador confirma cada item en el detalle de la orden.
  return { ok: true, orderId: order.id, orderCode: code };
}
