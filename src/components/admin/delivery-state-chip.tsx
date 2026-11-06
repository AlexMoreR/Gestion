import type { EstadoEntrega, TipoEstadoEntrega } from "@/lib/delivery-tracking";

// Mismas clases de color que los badges de estado de src/lib/orders.ts.
const CLASES: Record<TipoEstadoEntrega, string> = {
  SIN_FECHA: "border-border bg-muted text-muted-foreground",
  A_TIEMPO: "border-sky-500/30 bg-sky-500/15 text-sky-600 dark:text-sky-400",
  POR_VENCER: "border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-400",
  ATRASADO: "border-red-500/30 bg-red-500/15 text-red-600 dark:text-red-400",
  EN_CAMINO: "border-blue-500/30 bg-blue-500/15 text-blue-600 dark:text-blue-400",
  ENTREGADO_A_TIEMPO: "border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  ENTREGADO_TARDE: "border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-400",
};

export function DeliveryStateChip({ estado }: { estado: EstadoEntrega }) {
  return (
    <span className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium ${CLASES[estado.tipo]}`}>
      {estado.etiqueta}
    </span>
  );
}
