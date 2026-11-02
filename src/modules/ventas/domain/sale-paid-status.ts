import type { SaleStatus } from "@prisma/client";

/**
 * Estado de la venta según lo pagado: pagado ≥ total → INVOICED; por debajo → ACTIVE.
 * Solo mueve entre ACTIVE e INVOICED: CANCELLED, COMPLETED y DRAFT no se tocan.
 */
export function saleStatusForPaid(pagado: number, total: number, estadoActual: SaleStatus): SaleStatus {
  if (estadoActual !== "ACTIVE" && estadoActual !== "INVOICED") return estadoActual;
  return pagado >= total ? "INVOICED" : "ACTIVE";
}
