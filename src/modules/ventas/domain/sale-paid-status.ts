import type { SaleStatus } from "@prisma/client";

/**
 * Estado de una venta según lo pagado (inicial + abonos):
 * pagado ≥ total → INVOICED (pagada); si baja del total → ACTIVE.
 * Solo mueve entre ACTIVE e INVOICED: nunca toca CANCELLED, COMPLETED ni DRAFT.
 * Una venta nueva se evalúa con estadoActual = "ACTIVE".
 */
export function saleStatusForPaid(pagado: number, total: number, estadoActual: SaleStatus): SaleStatus {
  if (estadoActual === "ACTIVE" && pagado >= total) return "INVOICED";
  if (estadoActual === "INVOICED" && pagado < total) return "ACTIVE";
  return estadoActual;
}
