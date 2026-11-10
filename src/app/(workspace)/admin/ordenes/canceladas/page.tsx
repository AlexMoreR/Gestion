import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Filter } from "lucide-react";

import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { displayCode } from "@/lib/code-display";
import { colombiaDayKey, colombiaTimeOfDay } from "@/lib/colombia-time";
import {
  CANCEL_REASONS,
  CANCEL_SIN_DATO,
  filtrarCanceladas,
  parseFiltrosCanceladas,
  resumenCanceladas,
} from "@/lib/order-cancellation";
import { listCanceladaFilas } from "@/lib/order-cancellations-report.server";

// Órdenes de venta canceladas, con motivo, quién y cuándo. Solo lectura: no toca dinero, stock ni estados.
// Cancelar y reactivar siguen en el detalle de cada orden.

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminOrdenesCanceladasPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/unauthorized");
  }

  const canAccess = await hasAdminModuleAccess(session.user.id, session.user.role, "orders");
  if (!canAccess) {
    redirect("/unauthorized");
  }

  const filtros = parseFiltrosCanceladas(await searchParams);
  const todas = await listCanceladaFilas();
  const filas = filtrarCanceladas(todas, filtros);
  const resumen = resumenCanceladas(filas);

  return (
    <section className="w-full space-y-4">
      <div className="space-y-1">
        <Link href="/admin/ordenes" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Órdenes
        </Link>
        <h1 className="text-xl font-semibold text-foreground">Canceladas</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Órdenes de venta canceladas: por qué, quién y cuándo. Se cancelan y se reactivan en el detalle de cada orden.
          Esta vista no cambia dinero ni stock.
        </p>
      </div>

      <form method="get" className="grid gap-2 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Input type="month" name="mes" defaultValue={filtros.mes ?? ""} aria-label="Mes" />
        <select name="motivo" defaultValue={filtros.motivo ?? ""} className="field-select" aria-label="Motivo">
          <option value="">Todos los motivos</option>
          {CANCEL_REASONS.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
          <option value={CANCEL_SIN_DATO}>Sin dato</option>
        </select>
        <Button type="submit" className="gap-1.5">
          <Filter className="h-4 w-4" />
          Filtrar
        </Button>
        <Link
          href="/admin/ordenes/canceladas"
          className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-card px-3 text-sm text-foreground hover:bg-muted"
        >
          Quitar filtros
        </Link>
      </form>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Canceladas</p>
          <p className="text-2xl font-semibold tabular-nums text-foreground">{resumen.cantidad}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Con cobros</p>
          <p className="text-2xl font-semibold tabular-nums text-foreground">{resumen.conCobros}</p>
          <p className="text-xs text-muted-foreground">Tienen abonos o anticipo: revisar a mano</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Por motivo</p>
          {resumen.porMotivo.length > 0 ? (
            <ul className="space-y-1 text-sm">
              {resumen.porMotivo.map((m) => (
                <li key={m.etiqueta} className="flex justify-between gap-2">
                  <span className="min-w-0 truncate">{m.etiqueta}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{m.cantidad}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">—</p>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        {filas.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Cancelada el</th>
                  <th className="py-2 pr-3 font-medium">Orden</th>
                  <th className="py-2 pr-3 font-medium">Clienta</th>
                  <th className="py-2 pr-3 font-medium">Productos</th>
                  <th className="py-2 pr-3 font-medium">Asesora</th>
                  <th className="py-2 pr-3 font-medium">Motivo</th>
                  <th className="py-2 font-medium">Canceló</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((fila) => (
                  <tr key={fila.orderId} className="border-b border-border/60 align-top">
                    <td className="py-2 pr-3 tabular-nums">
                      {colombiaDayKey(fila.fecha)}
                      <p className="text-xs text-muted-foreground">{colombiaTimeOfDay(fila.fecha)}</p>
                    </td>
                    <td className="py-2 pr-3">
                      <Link href={`/admin/ordenes/${fila.orderId}`} className="font-medium text-primary hover:underline">
                        {displayCode(fila.orderCode)}
                      </Link>
                      {fila.saleCode ? <p className="text-xs text-muted-foreground">{displayCode(fila.saleCode)}</p> : null}
                      {fila.tieneCobros ? (
                        <p className="text-xs font-medium text-amber-700 dark:text-amber-400">Tiene cobros: revisar a mano</p>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3">{fila.clienta}</td>
                    <td className="py-2 pr-3">{fila.productos}</td>
                    <td className="py-2 pr-3">{fila.asesora}</td>
                    <td className="py-2 pr-3">
                      {fila.motivo.etiqueta}
                      {fila.motivo.texto ? ` — ${fila.motivo.texto}` : ""}
                      {fila.motivo.notas ? <p className="text-xs text-muted-foreground">Notas: {fila.motivo.notas}</p> : null}
                    </td>
                    <td className="py-2">{fila.canceladoPor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-sm text-muted-foreground">
            {todas.length > 0
              ? "Ninguna orden cancelada con esos filtros. Prueba con «Quitar filtros»."
              : "Aún no hay órdenes de venta canceladas. Se cancelan en el detalle de la orden con «Cancelar»."}
          </div>
        )}
      </div>
    </section>
  );
}
