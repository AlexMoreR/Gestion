// Combo Camillas: al registrar una venta que trae el combo, crea sola su orden de venta
// y confirma las piezas del combo con la proveedora Laura al costo pactado (su
// ProductSupplier.supplierCost del combo). Hace lo mismo que el flujo manual (crear orden +
// "Fabricar"): guarda purchaseCost, crea el cargo en la cuenta de Laura y la produccion.
// La logica vive en crear-orden-combo.ts (la comparte el script de relleno); aca se suma
// la bitacora. No le escribe a nadie: el link de fabricacion es el que ya muestra la orden.
import "server-only";
import { logActivity } from "@/lib/activity-log";
import { ORDEN_COMBO_CREADA_SOLA } from "../domain/combo-camillas";
import { crearOrdenCombo, type AutoCreateComboOrderResult } from "./crear-orden-combo";

export type { AutoCreateComboOrderResult };

export async function autoCreateComboOrder(saleId: string, actorId: string): Promise<AutoCreateComboOrderResult> {
  const result = await crearOrdenCombo(saleId, actorId);
  if (result.creada) {
    await logActivity({
      action: "CREATE",
      entityType: "ORDER",
      entityId: result.orderId,
      summary: `${ORDEN_COMBO_CREADA_SOLA}: ${result.orderCode}`,
    });
  }
  return result;
}
