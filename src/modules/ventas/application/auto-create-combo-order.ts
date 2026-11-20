// Combo Camillas: al registrar una venta que trae el combo, crea sola su orden de venta
// y confirma las piezas del combo con la proveedora Laura al costo pactado (su
// ProductSupplier.supplierCost del combo). Hace lo mismo que el flujo manual (crear orden +
// "Fabricar"): guarda purchaseCost, crea el cargo en la cuenta de Laura y la produccion.
// La logica vive en crear-orden-combo.ts (la comparte el script de relleno); aca se suma
// la bitacora y la OF (nov-2026): antes la OF solo nacia al abrir el detalle de la orden.
// Apenas nace la OF, en segundo plano se le manda por WhatsApp a la proveedora (parte 3,
// enviar-of-proveedora.ts; por defecto en modo prueba, al numero del dueno).
import "server-only";
import { logActivity } from "@/lib/activity-log";
import { displayCode } from "@/lib/code-display";
import { ensureManufacturingOrders } from "@/lib/manufacturing-orders";
import { prisma } from "@/lib/prisma";
import { ORDEN_COMBO_CREADA_SOLA } from "../domain/combo-camillas";
import { prismaAvisoOFPuertos } from "../infrastructure/prisma-aviso-of";
import { crearOrdenCombo, type AutoCreateComboOrderResult } from "./crear-orden-combo";
import { enviarOFProveedora } from "./enviar-of-proveedora";
import { dispararRecibo } from "./enviar-recibo-caja";

export type { AutoCreateComboOrderResult };

export async function autoCreateComboOrder(
  saleId: string,
  actorId: string,
): Promise<AutoCreateComboOrderResult & { ofCode?: string }> {
  const result = await crearOrdenCombo(saleId, actorId);
  if (!result.creada) return result;

  // La OF va despues de la transaccion: si falla, la orden y el cargo ya quedaron y la OF
  // se crea al abrir la orden, como antes (ensureManufacturingOrders nunca la repite).
  let ofCode: string | undefined;
  if (result.conFabrica) {
    try {
      const [of] = await ensureManufacturingOrders(result.orderId, [result.supplierId]);
      ofCode = of?.code;
      // Nunca rompe la venta ni el abono; el candado evita que la misma OF salga dos veces.
      if (of) dispararRecibo(() => enviarOFProveedora(of.id, prismaAvisoOFPuertos(actorId)));
    } catch (error) {
      console.error("Combo Camillas: no se pudo crear la OF sola:", error);
    }
  }

  // El inicio del resumen no cambia: la pantalla de la orden lo busca con startsWith.
  const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { name: true, email: true } })
    .catch(() => null);
  const quien = actor?.name || actor?.email || "sin dato";
  await logActivity({
    action: "CREATE",
    entityType: "ORDER",
    entityId: result.orderId,
    entityCode: result.orderCode,
    summary: `${ORDEN_COMBO_CREADA_SOLA}: ${displayCode(result.orderCode)}${ofCode ? ` · ${displayCode(ofCode)} creada sola` : ""} por ${quien}`,
  });
  return { ...result, ofCode };
}
