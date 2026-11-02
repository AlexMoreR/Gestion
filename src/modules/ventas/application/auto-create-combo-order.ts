// Combo Camillas: al registrar una venta que trae el combo, crea sola su orden de venta
// y confirma las piezas del combo con la proveedora Laura al costo pactado (su
// ProductSupplier.supplierCost del combo). Hace lo mismo que el flujo manual (crear orden +
// "Fabricar"): guarda purchaseCost, crea el cargo en la cuenta de Laura y la produccion.
// Todo en una transaccion: o queda la orden completa o no queda nada (y la alerta avisa).
// No le escribe a nadie: el link de fabricacion es el que ya muestra la pantalla de la orden.
import "server-only";
import { logActivity } from "@/lib/activity-log";
import { confirmOrderItemSupplier } from "@/lib/order-item-confirm";
import { prisma } from "@/lib/prisma";
import { createSaleOrder } from "@/lib/sale-order";
import { getComboCamillasSupplierId } from "@/lib/system-settings";
import {
  codigosComboDeVenta,
  costosItemsCombo,
  itemsParaPlan,
  planComboOrder,
  type ComboAlertaMotivo,
  type LineaVenta,
} from "../domain/combo-camillas";

export type AutoCreateComboOrderResult =
  | { creada: true; orderId: string; orderCode: string }
  | { creada: false; motivo: "nada" | "venta_no_encontrada" | ComboAlertaMotivo };

export async function autoCreateComboOrder(saleId: string, actorId: string): Promise<AutoCreateComboOrderResult> {
  const configSupplierId = await getComboCamillasSupplierId();

  const result = await prisma.$transaction(async (tx): Promise<AutoCreateComboOrderResult> => {
    const sale = await tx.sale.findUnique({
      where: { id: saleId },
      select: {
        order: { select: { id: true } },
        quote: {
          select: {
            items: {
              select: {
                id: true,
                productId: true,
                quantity: true,
                notes: true,
                product: {
                  select: {
                    code: true,
                    name: true,
                    isBundle: true,
                    bundleComponents: { orderBy: { sortOrder: "asc" }, select: { childId: true, quantity: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!sale) return { creada: false, motivo: "venta_no_encontrada" };
    if (sale.order) return { creada: false, motivo: "nada" };

    const lineas: LineaVenta[] = sale.quote.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      quantity: item.quantity,
      notes: item.notes,
      product: {
        code: item.product.code,
        name: item.product.name,
        // Igual que expandQuoteItemToOrderItems: solo un combo con componentes se parte.
        piezas: item.product.isBundle
          ? item.product.bundleComponents.map((c) => ({ productId: c.childId, cantidadPorCombo: c.quantity }))
          : [],
      },
    }));
    const items = itemsParaPlan(lineas);
    const codigos = codigosComboDeVenta(lineas);
    if (codigos.length === 0) {
      return { creada: false, motivo: items.length === 0 ? "falta_producto" : "nada" };
    }

    // Laura: la guardada en AppSetting; si no, toda fabrica cuyo nombre diga "Laura"
    // (planComboOrder exige que sea una sola).
    const proveedoras = configSupplierId
      ? await tx.supplier.findMany({ where: { id: configSupplierId }, select: { id: true, name: true } })
      : await tx.supplier.findMany({
          where: { type: "MANUFACTURER", name: { contains: "laura", mode: "insensitive" } },
          select: { id: true, name: true },
        });

    // Costo de Laura para el combo (ej. 600.000). Si los combos de la venta tienen costos
    // distintos o falta alguno, no se adivina: queda sin costo y sale la alerta.
    let costo: number | null = null;
    if (proveedoras.length === 1) {
      const combos = await tx.product.findMany({
        where: { code: { in: codigos } },
        select: {
          suppliers: { where: { supplierId: proveedoras[0].id }, select: { supplierCost: true } },
        },
      });
      const costos = combos.map((combo) => (combo.suppliers[0]?.supplierCost == null ? null : Number(combo.suppliers[0].supplierCost)));
      const distintos = new Set(costos);
      costo = combos.length === codigos.length && distintos.size === 1 ? costos[0] : null;
    }

    const plan = planComboOrder({ items, proveedoras, costo, yaTieneOrden: false });
    if (plan.accion === "nada") return { creada: false, motivo: "nada" };
    if (plan.accion === "alerta") return { creada: false, motivo: plan.motivo };

    const orden = await createSaleOrder(tx, { saleId, actorId });
    if (!orden.ok) {
      return { creada: false, motivo: orden.motivo === "ya_tiene_orden" ? "nada" : "venta_no_encontrada" };
    }

    const itemsOrden = await tx.orderItem.findMany({
      where: { orderId: orden.orderId },
      orderBy: { id: "asc" },
      select: { id: true, quoteItemId: true, productId: true, quantity: true, notes: true, fulfillmentMode: true },
    });
    for (const { orderItemId, unitCost } of costosItemsCombo(plan.unitCost, lineas, itemsOrden)) {
      const confirmado = await confirmOrderItemSupplier(tx, {
        orderItemId,
        supplierId: plan.supplierId,
        unitCost,
        actorId,
        omitirChequeoProveedor: true, // Laura ya se verifico como proveedora del combo (tiene su costo)
      });
      // Si un item no se puede confirmar se deshace todo (orden incluida) y queda la alerta.
      if (!confirmado.ok) throw new Error(`Combo Camillas: no se pudo confirmar el item (${confirmado.motivo})`);
    }

    return { creada: true, orderId: orden.orderId, orderCode: orden.orderCode };
  });

  if (result.creada) {
    await logActivity({
      action: "CREATE",
      entityType: "ORDER",
      entityId: result.orderId,
      summary: `Orden creada sola (Combo Camillas): ${result.orderCode}`,
    });
  }
  return result;
}
