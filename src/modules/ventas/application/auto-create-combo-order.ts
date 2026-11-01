// Combo Camillas: al registrar una venta que trae el combo, crea sola su orden de
// venta y confirma los items del combo con la proveedora Laura al costo pactado
// (ProductSupplier.supplierCost, 600.000 por combo). Usa las mismas funciones que el
// flujo manual (createSaleOrder + confirmOrderItemSupplier): guarda purchaseCost,
// crea el cargo en la cuenta de Laura y manda a produccion. No avisa a nadie.
// Si algo no cuadra no crea nada: la venta queda sin orden y la alerta la muestra.
import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-log";
import { createSaleOrder } from "@/lib/sale-order";
import { confirmOrderItemSupplier } from "@/lib/order-item-confirm";
import { parseQuoteItemMeta } from "../../../lib/quote-item-meta";
import { normalizeProductCode } from "../../../lib/product-code";
import { esComboCamillas, esLaura, planComboOrder, repartirCostoCombo, type ComboPlan, type Proveedora } from "../domain/combo-camillas";

// AppSetting opcional: { "supplierId": "<id de Laura>" } fija la proveedora sin buscarla por nombre.
export const COMBO_CAMILLAS_CONFIG_KEY = "comboCamillasConfig";

export type AutoComboOrderResult =
  | { creada: true; orderId: string; orderCode: string }
  | { creada: false; plan: Exclude<ComboPlan, { accion: "crear" }> };

async function buscarProveedoras(tx: Prisma.TransactionClient): Promise<Proveedora[]> {
  const setting = await tx.appSetting.findUnique({ where: { key: COMBO_CAMILLAS_CONFIG_KEY } });
  let supplierId: unknown = null;
  try {
    supplierId = setting ? JSON.parse(setting.value)?.supplierId : null;
  } catch {
    supplierId = null;
  }
  if (typeof supplierId === "string" && supplierId) {
    const fijada = await tx.supplier.findUnique({ where: { id: supplierId }, select: { id: true, name: true } });
    if (fijada) return [fijada];
  }
  return tx.supplier.findMany({
    where: { type: "MANUFACTURER", name: { contains: "laura", mode: "insensitive" } },
    select: { id: true, name: true },
  });
}

type GrupoCombo = { codigo: string; cantidad: number; lineas: Array<{ quoteItemId: string; cantidad: number }> };

// Al cotizar (y en venta directa) un combo se guarda partido en piezas que comparten
// comboKey, con el codigo y la cantidad del combo en la nota. Un producto suelto
// (o un combo sin piezas) es su propio grupo.
export function agruparLineas(
  items: Array<{ id: string; quantity: number; notes: string | null; product: { code: string | null } }>,
): GrupoCombo[] {
  const grupos: GrupoCombo[] = [];
  const porCombo = new Map<string, GrupoCombo>();
  for (const item of items) {
    const meta = parseQuoteItemMeta(item.notes);
    const linea = { quoteItemId: item.id, cantidad: item.quantity };
    if (!meta.comboKey) {
      grupos.push({ codigo: item.product.code ?? "", cantidad: item.quantity, lineas: [linea] });
      continue;
    }
    const existente = porCombo.get(meta.comboKey);
    if (existente) {
      existente.lineas.push(linea);
      continue;
    }
    const grupo = { codigo: meta.comboCode, cantidad: meta.comboQuantity, lineas: [linea] };
    porCombo.set(meta.comboKey, grupo);
    grupos.push(grupo);
  }
  return grupos;
}

export async function autoCreateComboOrder(saleId: string, actorId: string): Promise<AutoComboOrderResult> {
  const result = await prisma.$transaction(
    async (tx): Promise<AutoComboOrderResult> => {
      const sale = await tx.sale.findUnique({
        where: { id: saleId },
        select: {
          order: { select: { id: true } },
          quote: {
            select: {
              items: { select: { id: true, quantity: true, notes: true, product: { select: { code: true } } } },
            },
          },
        },
      });
      if (!sale) return { creada: false, plan: { accion: "nada" } };

      const grupos = agruparLineas(sale.quote.items);
      const combos = grupos.filter(esComboCamillas);
      const proveedoras = combos.length > 0 && !sale.order ? await buscarProveedoras(tx) : [];
      const lauras = proveedoras.filter(esLaura);

      // El costo sale de Laura para cada producto combo de la venta; si falta o difiere, no se adivina.
      let costo: number | null = null;
      if (lauras.length === 1) {
        const codigos = [...new Set(combos.map((grupo) => normalizeProductCode(grupo.codigo)))];
        const costos = await tx.productSupplier.findMany({
          where: { supplierId: lauras[0].id, product: { code: { in: codigos, mode: "insensitive" } } },
          select: { supplierCost: true },
        });
        const valores = new Set(costos.map((row) => (row.supplierCost == null ? null : Number(row.supplierCost))));
        const [unico] = [...valores];
        costo = costos.length === codigos.length && valores.size === 1 && unico != null ? unico : null;
      }

      const plan = planComboOrder({ items: grupos, proveedoras, costo, yaTieneOrden: Boolean(sale.order) });
      if (plan.accion !== "crear") return { creada: false, plan };

      const created = await createSaleOrder(tx, { saleId, actorId });
      if (!created.ok) {
        if (created.motivo === "ya_tiene_orden") return { creada: false, plan: { accion: "nada" } };
        throw new Error(`Combo Camillas: no se pudo crear la orden (${created.motivo})`);
      }

      // Cada linea de la cotizacion pasa tal cual a la orden (mismo quoteItemId).
      const orderItems = await tx.orderItem.findMany({
        where: { orderId: created.orderId },
        select: { id: true, quoteItemId: true },
      });
      const confirmar: Array<{ orderItemId: string; unitCost: number }> = [];
      for (const grupo of combos) {
        if (grupo.cantidad <= 0) throw new Error("Combo Camillas: la nota del combo no trae su cantidad");
        // El costo va una vez por combo: entero en la primera pieza, 0 en las demas.
        const costos = repartirCostoCombo(
          plan.unitCost,
          grupo.lineas.map((linea) => ({ cantidadPorCombo: linea.cantidad / grupo.cantidad })),
        );
        grupo.lineas.forEach((linea, index) => {
          const item = orderItems.find((row) => row.quoteItemId === linea.quoteItemId);
          if (!item) throw new Error("Combo Camillas: no se encontro una pieza del combo en la orden");
          confirmar.push({ orderItemId: item.id, unitCost: costos[index] });
        });
      }

      for (const entry of confirmar) {
        const confirmed = await confirmOrderItemSupplier(tx, {
          orderItemId: entry.orderItemId,
          supplierId: plan.supplierId,
          unitCost: entry.unitCost,
          actorId,
        });
        // Al lanzar se deshace toda la transaccion: no queda una orden a medias.
        if (!confirmed.ok) throw new Error(`Combo Camillas: no se pudo confirmar con Laura (${confirmed.motivo})`);
      }

      return { creada: true, orderId: created.orderId, orderCode: created.orderCode };
    },
    { timeout: 20_000 },
  );

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
