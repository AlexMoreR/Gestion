import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DeliveryStateChip } from "@/components/admin/delivery-state-chip";
import type { CumplimientoProveedor } from "@/lib/delivery-tracking";
import type { SeguimientoPanel } from "@/lib/delivery-tracking.server";

// Recibe los datos ya calculados (cargarSeguimiento): no consulta la base.
export function DeliveryTrackingCard({ datos }: { datos: SeguimientoPanel }) {
  const { resumen, fabricacion, transporte } = datos;
  const contadores = [
    { etiqueta: "Atrasados", valor: resumen.atrasados, clase: "text-red-600 dark:text-red-400" },
    { etiqueta: "Por vencer hoy", valor: resumen.porVencer, clase: "text-amber-600 dark:text-amber-400" },
    { etiqueta: "En camino", valor: resumen.enCamino, clase: "text-blue-600 dark:text-blue-400" },
    { etiqueta: "Sin fecha", valor: resumen.sinFecha, clase: "text-muted-foreground" },
  ];

  return (
    <Card className="mt-4 border-border/50">
      <CardHeader>
        <CardTitle className="text-xl">Seguimiento de entregas y fabricaciones</CardTitle>
        <CardDescription>Despachos y órdenes de fabricación (OF) de las órdenes abiertas.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {contadores.map((c) => (
            <div key={c.etiqueta} className="rounded-lg border border-border/50 p-3">
              <p className={`text-2xl font-bold ${c.clase}`}>{c.valor}</p>
              <p className="text-xs text-muted-foreground">{c.etiqueta}</p>
            </div>
          ))}
        </div>

        {resumen.pendientes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay entregas ni fabricaciones pendientes.</p>
        ) : (
          <div className="space-y-1">
            <ul className="divide-y divide-border/50">
              {resumen.pendientes.map((fila, i) => (
                <li key={`${fila.orderId}-${i}`}>
                  <Link
                    href={`/admin/ordenes/${fila.orderId}`}
                    className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm hover:bg-muted/50"
                  >
                    <span className="min-w-0">
                      <span className="font-medium">{fila.codigo}</span>
                      <span className="text-muted-foreground"> · {fila.cliente} · {fila.que}</span>
                    </span>
                    <DeliveryStateChip estado={fila.estado} />
                  </Link>
                </li>
              ))}
            </ul>
            {resumen.totalPendientes > resumen.pendientes.length && (
              <p className="text-xs text-muted-foreground">
                Se muestran {resumen.pendientes.length} de {resumen.totalPendientes}.
              </p>
            )}
          </div>
        )}

        <details className="rounded-lg border border-border/50 p-3">
          <summary className="cursor-pointer text-sm font-medium">Cumplimiento últimos 90 días</summary>
          <div className="mt-3 space-y-4">
            <p className="text-xs text-muted-foreground">
              Por fecha real. En un envío con varios tramos solo se mide la transportadora principal.
            </p>
            <TablaCumplimiento titulo="Fabricación" filas={fabricacion} />
            <TablaCumplimiento titulo="Transportadoras" filas={transporte} />
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

function TablaCumplimiento({ titulo, filas }: { titulo: string; filas: CumplimientoProveedor[] }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">{titulo}</h3>
      {filas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aún no hay entregas con fecha estimada</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50 text-left text-xs text-muted-foreground">
                <th className="py-1 pr-3 font-medium">Proveedor</th>
                <th className="py-1 pr-3 text-right font-medium">Entregas</th>
                <th className="py-1 pr-3 text-right font-medium">A tiempo</th>
                <th className="py-1 pr-3 text-right font-medium">Tarde</th>
                <th className="py-1 pr-3 text-right font-medium">% cumplimiento</th>
                <th className="py-1 text-right font-medium">Atraso promedio</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((fila) => (
                <tr key={fila.proveedorId} className="border-b border-border/50 last:border-0">
                  <td className="py-1 pr-3">{fila.nombre}</td>
                  <td className="py-1 pr-3 text-right">{fila.entregas}</td>
                  <td className="py-1 pr-3 text-right">{fila.aTiempo}</td>
                  <td className="py-1 pr-3 text-right">{fila.tarde}</td>
                  <td className="py-1 pr-3 text-right">{fila.cumplimientoPct}%</td>
                  <td className="py-1 text-right">{fila.tarde > 0 ? `${fila.atrasoPromedioHoras} h` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
