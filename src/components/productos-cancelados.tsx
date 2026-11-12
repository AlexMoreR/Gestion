import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";
import type { LineaCancelada } from "@/lib/lineas-canceladas";
import { fechaAviso } from "@/lib/color-change";

// Productos cancelados de una venta: tachados, con «Cancelado», el motivo y la fecha. Ya no suman al total.
export function ProductosCancelados({
  lineas,
  currency,
  publico = false,
}: {
  lineas: LineaCancelada[];
  currency: SupportedCurrencyCode;
  /** Cotización o factura de la clienta (colores fijos claros, también en el PDF). */
  publico?: boolean;
}) {
  if (lineas.length === 0) return null;
  return (
    <div
      className={
        publico
          ? "rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700"
          : "rounded-xl border border-border bg-card p-3 text-sm text-muted-foreground"
      }
    >
      <p className={publico ? "mb-1 font-semibold text-slate-900" : "mb-1 font-semibold text-foreground"}>
        Productos cancelados (no suman al total)
      </p>
      <ul className="space-y-1">
        {lineas.map((linea, index) => (
          <li key={index} className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="min-w-0 break-words">
              <span className="mr-1.5 rounded bg-rose-100 px-1.5 py-0.5 text-[11px] font-semibold uppercase text-rose-700">
                Cancelado
              </span>
              <span className="line-through">
                {linea.cantidad > 0 ? `${linea.cantidad} × ` : ""}
                {linea.producto}
              </span>
              <span className="ml-1.5 text-xs">
                · {fechaAviso(linea.fecha)} · {linea.motivo}
              </span>
            </span>
            <span className="shrink-0 line-through">{formatMoney(linea.total, currency)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
