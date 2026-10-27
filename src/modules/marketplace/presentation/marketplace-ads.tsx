"use client";

import * as React from "react";
import { Download, ExternalLink, Search } from "lucide-react";

import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";
import { cn } from "@/lib/utils";
import {
  ANUNCIO_CSV_COLUMNS,
  type AnuncioFilters,
  filterAnuncios,
  groupByCity,
  toCsvRows,
} from "@/modules/marketplace/domain/marketplace-monitor";
import { AD_STATE_LABEL, type AnuncioRow, type Anuncios, formatBogotaDateTime, toCsv } from "@/modules/marketplace/domain/marketplace-stats";
import { Card, downloadCsv, FIELD_CLASS, fmt } from "./marketplace-ui";

export type ProductLink = { name: string; path: string };

const PAGE_SIZE = 50;

const STATE_CLASS: Record<string, string> = {
  publicado: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  por_verificar: "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  fallido: "border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-400",
};

function StateBadge({ state }: { state: string }) {
  return (
    <span className={cn("inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium", STATE_CLASS[state] ?? "border-border text-muted-foreground")}>
      {AD_STATE_LABEL[state] ?? state}
    </span>
  );
}

function FacebookLink({ url }: { url: string | null }) {
  if (!url) return <span className="text-xs text-muted-foreground">Sin enlace</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-md border border-border bg-card px-2.5 text-xs font-medium hover:bg-muted"
    >
      Ver en Facebook <ExternalLink className="h-3 w-3" aria-hidden />
    </a>
  );
}

function City({ row }: { row: AnuncioRow }) {
  return (
    <span title={row.ubicacion_estimada ? `Estimada: es la ubicación por defecto de la cuenta (${row.ubicacion}). Facebook no la entregó.` : row.ubicacion}>
      {row.ciudad}
      {row.ubicacion_estimada ? <span className="ml-1 text-[11px] text-muted-foreground">(est.)</span> : null}
    </span>
  );
}

function Product({ row, link }: { row: AnuncioRow; link?: ProductLink }) {
  const name = link?.name ?? row.producto;
  return (
    <div className="min-w-0" title={row.producto}>
      {row.codigo ? <span className="mr-1.5 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">{row.codigo}</span> : null}
      {link ? (
        <a href={link.path} target="_blank" rel="noopener noreferrer" className="text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground">
          {name}
        </a>
      ) : (
        <span className="text-foreground">{name}</span>
      )}
    </div>
  );
}

type Props = {
  anuncios: Anuncios | null;
  faltan: boolean;
  links: Record<string, ProductLink>;
  currency: SupportedCurrencyCode;
  desde: string;
  hasta: string;
  fetchDesde: string;
};

// Tabla de anuncios (con filtros y CSV) y totales por ciudad.
export function AdsSection({ anuncios, faltan, links, currency, desde, hasta, fetchDesde }: Props) {
  const [filters, setFilters] = React.useState<AnuncioFilters>({ desde, hasta, cuenta: "", ciudad: "", estado: "", q: "" });
  const [limit, setLimit] = React.useState(PAGE_SIZE);
  const set = (patch: Partial<AnuncioFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setLimit(PAGE_SIZE);
  };

  const all = React.useMemo(() => anuncios?.anuncios ?? [], [anuncios]);
  const accountOptions = React.useMemo(() => [...new Map(all.map((row) => [row.cuenta_id, row.cuenta])).entries()].sort((a, b) => a[1].localeCompare(b[1], "es")), [all]);
  const cityOptions = React.useMemo(() => [...new Set(all.map((row) => row.ciudad))].sort((a, b) => a.localeCompare(b, "es")), [all]);
  const rows = React.useMemo(() => filterAnuncios(all, filters), [all, filters]);
  const cities = React.useMemo(() => groupByCity(rows), [rows]);
  const shown = rows.slice(0, limit);
  const published = rows.filter((row) => row.estado === "publicado").length;
  const filtered = filters.cuenta || filters.ciudad || filters.estado || filters.q || filters.desde !== desde || filters.hasta !== hasta;

  if (!anuncios) {
    return (
      <Card title="Anuncios">
        <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
          {faltan
            ? "Falta actualizar NETMAGI (la API) para ver la lista de anuncios con su enlace y ciudad. El resto de la página funciona."
            : "No cargó la lista de anuncios."}
        </p>
      </Card>
    );
  }

  return (
    <>
      <Card
        title="Anuncios"
        action={
          <button
            type="button"
            disabled={rows.length === 0}
            onClick={() => downloadCsv(`marketplace-anuncios-${filters.desde}-a-${filters.hasta}.csv`, toCsv(ANUNCIO_CSV_COLUMNS, toCsvRows(rows, AD_STATE_LABEL)))}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" aria-hidden /> Exportar CSV
          </button>
        }
      >
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          <label className="min-w-0 text-[11px] font-medium text-muted-foreground">
            Desde
            <input type="date" className={FIELD_CLASS} value={filters.desde} min={fetchDesde} max={filters.hasta || hasta} onChange={(e) => set({ desde: e.target.value })} />
          </label>
          <label className="min-w-0 text-[11px] font-medium text-muted-foreground">
            Hasta
            <input type="date" className={FIELD_CLASS} value={filters.hasta} min={filters.desde || fetchDesde} max={hasta} onChange={(e) => set({ hasta: e.target.value })} />
          </label>
          <label className="min-w-0 text-[11px] font-medium text-muted-foreground">
            Cuenta
            <select className={FIELD_CLASS} value={filters.cuenta} onChange={(e) => set({ cuenta: e.target.value })}>
              <option value="">Todas</option>
              {accountOptions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0 text-[11px] font-medium text-muted-foreground">
            Ciudad
            <select className={FIELD_CLASS} value={filters.ciudad} onChange={(e) => set({ ciudad: e.target.value })}>
              <option value="">Todas</option>
              {cityOptions.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0 text-[11px] font-medium text-muted-foreground">
            Estado
            <select className={FIELD_CLASS} value={filters.estado} onChange={(e) => set({ estado: e.target.value })}>
              <option value="">Todos</option>
              {Object.entries(AD_STATE_LABEL).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="col-span-2 min-w-0 text-[11px] font-medium text-muted-foreground sm:col-span-1">
            Buscar código o nombre
            <span className="relative block">
              <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
              <input
                type="search"
                className={cn(FIELD_CLASS, "pl-8")}
                placeholder="CAV003"
                value={filters.q}
                onChange={(e) => set({ q: e.target.value })}
              />
            </span>
          </label>
        </div>

        <p className="mb-2 text-xs text-muted-foreground">
          {fmt(rows.length)} anuncio{rows.length === 1 ? "" : "s"} · {fmt(published)} publicado{published === 1 ? "" : "s"}
          {filtered ? (
            <button
              type="button"
              className="ml-2 underline"
              onClick={() => {
                setFilters({ desde, hasta, cuenta: "", ciudad: "", estado: "", q: "" });
                setLimit(PAGE_SIZE);
              }}
            >
              Quitar filtros
            </button>
          ) : null}
          {anuncios.truncado ? " · La lista muestra los 1.500 más recientes del periodo." : ""}
        </p>

        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            {all.length === 0 ? "El publicador no tiene anuncios en este periodo." : "Ningún anuncio coincide con los filtros."}
          </p>
        ) : (
          <>
            {/* Escritorio: tabla */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Fecha</th>
                    <th className="py-2 pr-3 font-medium">Cuenta</th>
                    <th className="py-2 pr-3 font-medium">Ciudad</th>
                    <th className="py-2 pr-3 font-medium">Producto</th>
                    <th className="py-2 pr-3 text-right font-medium">Precio</th>
                    <th className="py-2 pr-3 font-medium">Estado</th>
                    <th className="py-2 pr-3 text-right font-medium" title="Chats nuevos atribuidos al anuncio por su título (aproximado)">
                      Clientes
                    </th>
                    <th className="py-2 font-medium">Facebook</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((row) => (
                    <tr key={row.id} className="border-b border-border/60 align-middle last:border-0">
                      <td className="whitespace-nowrap py-2 pr-3 tabular-nums">{row.publicado_at ? formatBogotaDateTime(row.publicado_at) : row.dia.slice(8) + "/" + row.dia.slice(5, 7)}</td>
                      <td className="py-2 pr-3">{row.cuenta}</td>
                      <td className="whitespace-nowrap py-2 pr-3">
                        <City row={row} />
                      </td>
                      <td className="max-w-[320px] py-2 pr-3">
                        <Product row={row} link={row.codigo ? links[row.codigo] : undefined} />
                      </td>
                      <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums">{row.precio ? formatMoney(row.precio, currency) : "—"}</td>
                      <td className="py-2 pr-3">
                        <StateBadge state={row.estado} />
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{row.chats}</td>
                      <td className="py-2">
                        <FacebookLink url={row.url} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Celular: una tarjeta por anuncio */}
            <ul className="space-y-2 md:hidden">
              {shown.map((row) => (
                <li key={row.id} className="rounded-lg border border-border/70 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <Product row={row} link={row.codigo ? links[row.codigo] : undefined} />
                    <StateBadge state={row.estado} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {row.publicado_at ? formatBogotaDateTime(row.publicado_at) : row.dia} · {row.cuenta} · <City row={row} />
                  </p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      {row.precio ? formatMoney(row.precio, currency) : "—"} · {row.chats} cliente{row.chats === 1 ? "" : "s"}
                    </p>
                    <FacebookLink url={row.url} />
                  </div>
                </li>
              ))}
            </ul>

            {rows.length > shown.length ? (
              <div className="mt-3 text-center">
                <button
                  type="button"
                  onClick={() => setLimit((value) => value + PAGE_SIZE)}
                  className="h-9 rounded-md border border-border bg-card px-4 text-sm font-medium hover:bg-muted"
                >
                  Ver {Math.min(PAGE_SIZE, rows.length - shown.length)} más ({fmt(rows.length - shown.length)} sin mostrar)
                </button>
              </div>
            ) : null}
          </>
        )}
        <p className="mt-3 text-[11px] text-muted-foreground">
          Clientes = chats nuevos que llegaron después de publicar y que coinciden con el título del anuncio (aproximado). (est.) = la ciudad es la
          ubicación por defecto de la cuenta, no la que leyó la extensión del formulario de Facebook.
        </p>
      </Card>

      <Card title="Por ciudad">
        {cities.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">Sin anuncios para mostrar por ciudad.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Ciudad</th>
                  <th className="py-2 pr-3 text-right font-medium">Publicados</th>
                  <th className="py-2 pr-3 text-right font-medium">Clientes</th>
                  <th className="py-2 pr-3 text-right font-medium">A WhatsApp</th>
                  <th className="py-2 pr-3 text-right font-medium">Cuentas</th>
                  <th className="py-2 text-right font-medium">Ciudad leída de Facebook</th>
                </tr>
              </thead>
              <tbody>
                {cities.map((city) => (
                  <tr key={city.ciudad} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-3 font-medium text-foreground">{city.ciudad}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {fmt(city.publicados)}
                      {city.por_verificar + city.fallidos > 0 ? <span className="ml-1 text-[11px] text-muted-foreground">(+{city.por_verificar + city.fallidos} sin confirmar)</span> : null}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{fmt(city.chats)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{fmt(city.whatsapp)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{city.cuentas}</td>
                    <td className="py-2 text-right tabular-nums">
                      {city.anuncios - city.estimadas} de {city.anuncios}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-[11px] text-muted-foreground">
          Hoy se publica solo en una ciudad; cuando haya más, aquí se verá cuánto publica y cuántos clientes trae cada una. Los anuncios anteriores a la
          lectura de la ubicación cuentan con la ciudad por defecto de su cuenta.
        </p>
      </Card>
    </>
  );
}
