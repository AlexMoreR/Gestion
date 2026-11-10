import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Download, Filter } from "lucide-react";

import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { formatMoney } from "@/lib/currency";
import { getSystemCurrency } from "@/lib/system-settings";
import { displayCode } from "@/lib/code-display";
import { colombiaDayKey } from "@/lib/colombia-time";
import {
  estadoDeFila,
  filtrarDevoluciones,
  opcionesDeFiltros,
  parseFiltrosDevolucion,
  productosDeFila,
  resumenDevoluciones,
  type ConteoDevolucion,
} from "@/lib/order-return";
import { listDevolucionFilas } from "@/lib/order-returns-report.server";

// Todas las devoluciones (sin anular) y los despachos «Devuelto» sin registro. Solo lectura: no toca dinero,
// inventario ni despachos. La pérdida es informativa (flete de ida de lo devuelto + flete de vuelta).

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function Resumen({ titulo, filas, unidad }: { titulo: string; filas: ConteoDevolucion[]; unidad: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="mb-2 text-xs font-medium text-muted-foreground">{titulo}</p>
      {filas.length > 0 ? (
        <ul className="space-y-1 text-sm">
          {filas.slice(0, 6).map((fila) => (
            <li key={fila.clave} className="flex justify-between gap-2">
              <span className="min-w-0 truncate">{fila.clave}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {fila.cantidad} {unidad}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">—</p>
      )}
    </div>
  );
}

export default async function AdminOrdenesDevolucionesPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/unauthorized");
  }

  const canAccess = await hasAdminModuleAccess(session.user.id, session.user.role, "orders");
  if (!canAccess) {
    redirect("/unauthorized");
  }

  const params = await searchParams;
  const filtros = parseFiltrosDevolucion(params);
  const [currency, todas] = await Promise.all([getSystemCurrency(), listDevolucionFilas()]);
  const filas = filtrarDevoluciones(todas, filtros);
  const resumen = resumenDevoluciones(filas);
  const opciones = opcionesDeFiltros(todas);

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries({
    mes: filtros.mes,
    abiertas: filtros.abiertas ? "1" : null,
    motivo: filtros.motivo,
    producto: filtros.producto,
    proveedora: filtros.proveedora,
    transportadora: filtros.transportadora,
  })) {
    if (value) query.set(key, value);
  }
  const exportHref = `/admin/ordenes/devoluciones/export${query.size > 0 ? `?${query}` : ""}`;

  const select = (name: string, label: string, value: string | null, options: string[], todos: string) => (
    <select name={name} defaultValue={value ?? ""} className="field-select" aria-label={label}>
      <option value="">{todos}</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );

  return (
    <section className="w-full space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Link href="/admin/ordenes" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Órdenes
          </Link>
          <h1 className="text-xl font-semibold text-foreground">Devoluciones</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Lo que volvió de los despachos: por qué, dónde está y qué sigue. Se registra en el detalle de cada orden.
            La pérdida es informativa y no cambia Balances.
          </p>
        </div>
        <a
          href={exportHref}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium text-foreground hover:bg-muted"
        >
          <Download className="h-3.5 w-3.5" />
          Descargar Excel (CSV)
        </a>
      </div>

      <form method="get" className="grid gap-2 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Input type="month" name="mes" defaultValue={filtros.mes ?? ""} aria-label="Mes" />
        {select("motivo", "Motivo", filtros.motivo, opciones.motivos, "Todos los motivos")}
        {select("producto", "Producto", filtros.producto, opciones.productos, "Todos los productos")}
        {select("proveedora", "Proveedora", filtros.proveedora, opciones.proveedoras, "Todas las proveedoras")}
        {select("transportadora", "Transportadora", filtros.transportadora, opciones.transportadoras, "Todas las transportadoras")}
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" name="abiertas" value="1" defaultChecked={filtros.abiertas} className="h-4 w-4" />
          Solo abiertas
        </label>
        <Button type="submit" className="gap-1.5">
          <Filter className="h-4 w-4" />
          Filtrar
        </Button>
        <Link
          href="/admin/ordenes/devoluciones"
          className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-card px-3 text-sm text-foreground hover:bg-muted"
        >
          Quitar filtros
        </Link>
      </form>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Devoluciones</p>
          <p className="text-2xl font-semibold tabular-nums text-foreground">{resumen.cantidad}</p>
          <p className="text-xs text-muted-foreground">{resumen.abiertas} abierta(s)</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Pérdida informativa</p>
          <p className="text-2xl font-semibold tabular-nums text-foreground">{formatMoney(resumen.perdidaTotal, currency)}</p>
          <p className="text-xs text-muted-foreground">Flete de ida de lo devuelto + flete de vuelta</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Resumen titulo="Por motivo" filas={resumen.porMotivo} unidad="" />
        <Resumen titulo="Por producto (unidades)" filas={resumen.porProducto} unidad="u." />
        <Resumen titulo="Por proveedora" filas={resumen.porProveedora} unidad="" />
        <Resumen titulo="Por transportadora" filas={resumen.porTransportadora} unidad="" />
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        {filas.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Fecha</th>
                  <th className="py-2 pr-3 font-medium">Orden</th>
                  <th className="py-2 pr-3 font-medium">Producto</th>
                  <th className="py-2 pr-3 font-medium">Proveedora</th>
                  <th className="py-2 pr-3 font-medium">Transportadora</th>
                  <th className="py-2 pr-3 font-medium">Motivo</th>
                  <th className="py-2 pr-3 font-medium">Dónde está</th>
                  <th className="py-2 pr-3 font-medium">Qué sigue</th>
                  <th className="py-2 text-right font-medium">Pérdida</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((fila) => (
                  <tr key={fila.id} className="border-b border-border/60 align-top">
                    <td className="py-2 pr-3 tabular-nums">{colombiaDayKey(fila.fecha)}</td>
                    <td className="py-2 pr-3">
                      <Link href={`/admin/ordenes/${fila.orderId}`} className="font-medium text-primary hover:underline">
                        {displayCode(fila.orderCode)}
                      </Link>
                      <p
                        className={`text-xs ${fila.faltaRegistrar ? "font-medium text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}
                      >
                        {estadoDeFila(fila)}
                      </p>
                    </td>
                    <td className="py-2 pr-3">{productosDeFila(fila)}</td>
                    <td className="py-2 pr-3">{fila.proveedoras.join(", ")}</td>
                    <td className="py-2 pr-3">{fila.transportadora}</td>
                    <td className="py-2 pr-3">{fila.motivo}</td>
                    <td className="py-2 pr-3">{fila.dondeEsta}</td>
                    <td className="py-2 pr-3">{fila.queSigue}</td>
                    <td className="py-2 text-right tabular-nums">{formatMoney(fila.perdida, currency)}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="py-2 pr-3" colSpan={8}>
                    Total
                  </td>
                  <td className="py-2 text-right tabular-nums">{formatMoney(resumen.perdidaTotal, currency)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-sm text-muted-foreground">
            {todas.length > 0
              ? "Ninguna devolución con esos filtros. Prueba con «Quitar filtros»."
              : "Aún no hay devoluciones. Se registran en el detalle de la orden con «Registrar devolución»."}
          </div>
        )}
      </div>
    </section>
  );
}
