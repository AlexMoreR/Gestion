"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Download, PlugZap } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";
import { cn } from "@/lib/utils";
import {
  ACCOUNT_STATE_LABEL,
  type ChannelSales,
  type CsvColumn,
  type CuentaRow,
  formatBogotaDateTime,
  type NetmagiStats,
  pct,
  type ProductoRow,
  type Publicador,
  RANGE_OPTIONS,
  type SortDir,
  sortRows,
  toChartDays,
  toCsv,
} from "@/modules/marketplace/domain/marketplace-stats";

type Props = {
  days: number;
  desde: string;
  hasta: string;
  stats: NetmagiStats;
  channel: ChannelSales | null;
  currency: SupportedCurrencyCode;
};

const lineConfig = {
  entrantes: { label: "Entrantes", color: "#3b82f6" },
  respuestas: { label: "Respuestas del bot", color: "#8b5cf6" },
  whatsapp: { label: "Pases a WhatsApp", color: "#10b981" },
} satisfies ChartConfig;

const barConfig = {
  publicados: { label: "Publicados", color: "#10b981" },
  fallidos: { label: "Fallidos / restricción", color: "var(--destructive)" },
} satisfies ChartConfig;

// Miles con punto, sin Intl (servidor y navegador pintan lo mismo).
const fmt = (value: number) => String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

function Card({ title, children, className }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-4", className)}>
      {title ? <h2 className="mb-3 text-sm font-semibold text-foreground">{title}</h2> : null}
      {children}
    </div>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "warn" }) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-3", tone === "warn" && "border-amber-500/40 bg-amber-500/5")}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function downloadCsv(fileName: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

type Column<T> = CsvColumn<T> & { align?: "right"; render?: (row: T) => React.ReactNode };

function SortableTable<T>({
  title,
  rows,
  columns,
  initialSort,
  fileName,
  rowKey,
  empty,
}: {
  title: string;
  rows: T[];
  columns: Column<T>[];
  initialSort: keyof T;
  fileName: string;
  rowKey: (row: T, index: number) => string;
  empty: string;
}) {
  const [sort, setSort] = React.useState<{ key: keyof T; dir: SortDir }>({ key: initialSort, dir: "desc" });
  const sorted = React.useMemo(() => sortRows(rows, sort.key, sort.dir), [rows, sort]);
  const toggle = (key: keyof T) =>
    setSort((current) => (current.key === key ? { key, dir: current.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }));

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <button
          type="button"
          disabled={rows.length === 0}
          onClick={() => downloadCsv(fileName, toCsv(columns, sorted))}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" /> Exportar CSV
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                {columns.map((column) => {
                  const active = sort.key === column.key;
                  const Icon = active ? (sort.dir === "desc" ? ArrowDown : ArrowUp) : ArrowUpDown;
                  return (
                    <th key={String(column.key)} className={cn("py-2 pr-3 font-medium", column.align === "right" && "text-right")}>
                      <button
                        type="button"
                        onClick={() => toggle(column.key)}
                        className={cn("inline-flex items-center gap-1 hover:text-foreground", active && "text-foreground")}
                      >
                        {column.label}
                        <Icon className="h-3 w-3" />
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, index) => (
                <tr key={rowKey(row, index)} className="border-b border-border/60 last:border-0">
                  {columns.map((column) => (
                    <td key={String(column.key)} className={cn("py-2 pr-3", column.align === "right" && "text-right tabular-nums")}>
                      {column.render ? column.render(row) : String(row[column.key] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

const stateClass: Record<CuentaRow["estado"], string> = {
  en_vivo: "bg-emerald-500",
  fuera: "bg-amber-500",
  sin_conexion: "bg-muted-foreground/40",
};

const accountColumns: Column<CuentaRow>[] = [
  {
    key: "nombre",
    label: "Cuenta",
    render: (row) => (
      <span className="inline-flex items-center gap-2">
        <span className={cn("h-2 w-2 shrink-0 rounded-full", stateClass[row.estado])} title={ACCOUNT_STATE_LABEL[row.estado]} />
        <span className="text-foreground">{row.nombre}</span>
      </span>
    ),
  },
  { key: "estado", label: "Estado", render: (row) => ACCOUNT_STATE_LABEL[row.estado] },
  { key: "ultimo_latido", label: "Último latido", render: (row) => formatBogotaDateTime(row.ultimo_latido) },
  { key: "entrantes", label: "Entrantes", align: "right" },
  { key: "respuestas", label: "Respuestas", align: "right" },
  { key: "whatsapp", label: "WhatsApp", align: "right" },
  { key: "clientes_nuevos", label: "Nuevos", align: "right" },
  { key: "publicados", label: "Publicados", align: "right" },
  { key: "fallidos", label: "Fallidos", align: "right" },
  { key: "renovadas", label: "Renovadas", align: "right" },
  { key: "ultima_renovacion", label: "Últ. renovación", render: (row) => row.ultima_renovacion ?? "—" },
  {
    key: "habilitada",
    label: "Publicador",
    render: (row) => (row.habilitada ? (row.pausa ? `En pausa: ${row.pausa}` : "Habilitada") : "No"),
  },
  { key: "tope_diario", label: "Tope/día", align: "right" },
];

const productColumns: Column<ProductoRow>[] = [
  { key: "producto", label: "Producto (título del anuncio)", render: (row) => <span className="text-foreground">{row.producto}</span> },
  { key: "codigo", label: "Código", render: (row) => row.codigo ?? "—" },
  { key: "chats", label: "Chats nuevos", align: "right" },
  { key: "entrantes", label: "Entrantes", align: "right" },
  { key: "whatsapp", label: "A WhatsApp", align: "right" },
  { key: "pct_whatsapp", label: "% WhatsApp", align: "right", render: (row) => `${row.pct_whatsapp}%` },
  { key: "cuentas", label: "Cuentas", align: "right" },
];

const RESULT_LABEL: Record<string, string> = {
  publicado: "Publicado",
  fallido: "Fallido",
  por_verificar: "Por verificar",
  restriccion: "Restricción",
  bloqueado: "Bloqueado",
};

function PublicadorSection({ data }: { data: Publicador }) {
  const c = data.config;
  const entries = (map: Record<string, number>) => Object.entries(map).sort((a, b) => b[1] - a[1]);
  return (
    <Card title="Publicador (solo lectura)">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1 text-xs text-muted-foreground">
          <p>
            Estado:{" "}
            <span className={cn("font-medium", c.activo ? "text-emerald-600" : "text-foreground")}>{c.activo ? "Encendido" : "Apagado"}</span>
            {c.pausa_motivo ? ` · ${c.pausa_motivo}` : ""}
          </p>
          <p>
            {c.por_dia} por cuenta al día · {c.hora_inicio}:00–{c.hora_fin}:00 · cada {c.separacion_min} min
          </p>
          <p>
            Sin repetir producto {c.dias_sin_repetir} días · {c.aprobacion_manual ? "con aprobación" : "sin aprobación"} ·{" "}
            {c.publicar_automatico ? "publica el agente" : "publica una persona"}
          </p>
          <p>Cuentas habilitadas: {c.cuentas_habilitadas}</p>
          <p>
            Inventario: {data.inventario.productos} productos · {data.inventario.con_fotos_validas} con fotos válidas ·{" "}
            {data.inventario.con_codigo_gestion} con código de Gestión
          </p>
        </div>
        <div className="text-xs">
          <p className="mb-1 font-medium text-foreground">Resultados del periodo</p>
          {entries(data.periodo.resultados).length === 0 ? (
            <p className="text-muted-foreground">Sin publicaciones en el periodo.</p>
          ) : (
            <ul className="space-y-0.5 text-muted-foreground">
              {entries(data.periodo.resultados).map(([key, value]) => (
                <li key={key}>
                  {RESULT_LABEL[key] ?? key}: <span className="tabular-nums text-foreground">{value}</span>
                </li>
              ))}
              {entries(data.periodo.publicados_por_modo).map(([key, value]) => (
                <li key={`modo-${key}`}>
                  Publicados {key === "auto" ? "por el agente" : "a mano"}: <span className="tabular-nums text-foreground">{value}</span>
                </li>
              ))}
            </ul>
          )}
          {entries(data.periodo.fallos_por_campo).length > 0 ? (
            <p className="mt-2 text-muted-foreground">
              Fallos por campo: {entries(data.periodo.fallos_por_campo).map(([key, value]) => `${key} (${value})`).join(", ")}
            </p>
          ) : null}
        </div>
        <div className="text-xs">
          <p className="mb-1 font-medium text-foreground">Cola de hoy ({data.hoy.fecha})</p>
          {data.hoy.cola.length === 0 ? (
            <p className="text-muted-foreground">Nada programado hoy.</p>
          ) : (
            <ul className="max-h-48 space-y-1 overflow-y-auto pr-1">
              {data.hoy.cola.map((item, index) => (
                <li key={index} className="flex justify-between gap-2">
                  <span className="truncate text-foreground">
                    {formatBogotaDateTime(item.hora).slice(6)} · {item.producto}
                    {item.codigo ? ` (${item.codigo})` : ""}
                  </span>
                  <span className="shrink-0 text-muted-foreground">{item.estado}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {data.ultimos.length > 0 ? (
        <div className="-mx-4 mt-4 overflow-x-auto px-4">
          <p className="mb-1 text-xs font-medium text-foreground">Últimos resultados</p>
          <table className="w-full min-w-[560px] text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-1.5 pr-3 font-medium">Hora</th>
                <th className="py-1.5 pr-3 font-medium">Resultado</th>
                <th className="py-1.5 pr-3 font-medium">Cuenta</th>
                <th className="py-1.5 pr-3 font-medium">Producto</th>
                <th className="py-1.5 font-medium">Modo / campo</th>
              </tr>
            </thead>
            <tbody>
              {data.ultimos.map((item, index) => (
                <tr key={index} className="border-b border-border/60 last:border-0">
                  <td className="py-1.5 pr-3 tabular-nums">{formatBogotaDateTime(item.hora)}</td>
                  <td className="py-1.5 pr-3">{RESULT_LABEL[item.estado] ?? item.estado}</td>
                  <td className="py-1.5 pr-3">{item.cuenta}</td>
                  <td className="py-1.5 pr-3">
                    {item.producto}
                    {item.codigo ? ` (${item.codigo})` : ""}
                  </td>
                  <td className="py-1.5">{[item.modo, item.campo].filter(Boolean).join(" · ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Card>
  );
}

export function MarketplaceDashboard({ days, desde, hasta, stats, channel, currency }: Props) {
  const resumen = stats.resumen;
  const chartDays = React.useMemo(() => (resumen ? toChartDays(resumen.serie, channel?.byDay) : []), [resumen, channel]);
  const t = resumen?.totales;
  const hasPublications = chartDays.some((day) => day.publicados > 0 || day.fallidos > 0);

  return (
    <section className="w-full space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Marketplace · NETMAGI</h1>
          <p className="max-w-2xl text-xs text-muted-foreground">
            {desde} a {hasta} (hora Bogotá). Datos agregados de NETMAGI, sin nombres ni mensajes de clientes. Se actualizan cada 5 minutos.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
          {RANGE_OPTIONS.map((option) => (
            <Link
              key={option}
              href={`/admin/marketplace?dias=${option}`}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium",
                option === days ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {option} días
            </Link>
          ))}
        </div>
      </div>

      {!stats.ok || !resumen || !t ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border p-8 text-center">
          <PlugZap className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">No se pudieron traer las estadísticas de NETMAGI</p>
          <p className="max-w-md text-xs text-muted-foreground">{stats.error ?? "NETMAGI no respondió."} Intenta de nuevo en unos minutos.</p>
        </div>
      ) : (
        <>
          {stats.error ? (
            <p className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4 shrink-0" /> Algunas secciones no cargaron: {stats.error}
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Mensajes entrantes" value={fmt(t.entrantes)} hint={`${fmt(Math.round(t.entrantes / Math.max(1, days)))} por día`} />
            <Stat label="Respuestas del bot" value={fmt(t.respuestas)} />
            <Stat label="Clientes nuevos" value={fmt(t.clientes_nuevos)} />
            <Stat label="Pases a WhatsApp" value={fmt(t.whatsapp)} hint={`${t.pct_whatsapp}% de los nuevos`} />
            <Stat
              label="Cuentas en vivo"
              value={`${resumen.cuentas.en_vivo} / ${resumen.cuentas.total}`}
              hint={`${resumen.cuentas.sin_conexion} sin conexión · ${resumen.cuentas.fuera} fuera`}
              tone={resumen.cuentas.sin_conexion > 0 ? "warn" : undefined}
            />
            <Stat
              label="Publicados / fallidos"
              value={`${fmt(t.publicados)} / ${fmt(t.fallidos + t.restricciones)}`}
              hint={`${t.por_verificar} por verificar · ${t.restricciones} restricciones`}
              tone={t.restricciones > 0 ? "warn" : undefined}
            />
            <Stat label="Renovadas" value={fmt(t.renovadas)} hint={`${t.pasadas_renovacion} pasadas de renovación`} />
            <Stat label="Seguimientos" value={fmt(t.seguimientos)} />
            <Stat label="Sin respuesta" value={fmt(t.sin_respuesta)} hint="Preguntas que el bot no supo" />
          </div>

          <Card title="Ventas del canal Marketplace (Gestión)">
            {channel ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="Ventas" value={fmt(channel.count)} />
                <Stat label="Facturación" value={formatMoney(channel.revenue, currency)} />
                <Stat label="Ganancia" value={formatMoney(channel.profit, currency)} />
                <Stat
                  label="% de cierre"
                  value={channel.closeRatePct == null ? "—" : `${channel.closeRatePct}%`}
                  hint={`ventas / ${fmt(t.clientes_nuevos)} clientes nuevos · ${pct(channel.count, t.whatsapp)}% de los pases a WhatsApp`}
                />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No se pudieron leer las ventas de Gestión.</p>
            )}
            <p className="mt-2 text-[11px] text-muted-foreground">
              Ventas pagadas por completo en el periodo (criterio de Balances) con origen &quot;Marketplace&quot; (línea Ventas 2 del CRM). Las ventas sin
              origen registrado no se cuentan aquí; ver <Link href="/admin/ventas/origen" className="underline">Ventas por origen</Link>.
            </p>
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card title="Chats por día" className="lg:col-span-2">
              <ChartContainer config={lineConfig} className="h-64 w-full">
                <LineChart accessibilityLayer data={chartDays} margin={{ top: 8, left: -16, right: 8 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontSize={10} minTickGap={16} />
                  <YAxis tickLine={false} axisLine={false} fontSize={10} allowDecimals={false} width={40} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Line type="monotone" dataKey="entrantes" stroke="var(--color-entrantes)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="respuestas" stroke="var(--color-respuestas)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="whatsapp" stroke="var(--color-whatsapp)" strokeWidth={2} dot={false} />
                </LineChart>
              </ChartContainer>
            </Card>
            <Card title="Publicaciones por día">
              {hasPublications ? (
                <ChartContainer config={barConfig} className="h-64 w-full">
                  <BarChart accessibilityLayer data={chartDays} margin={{ top: 8, left: -16, right: 8 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontSize={10} minTickGap={16} />
                    <YAxis tickLine={false} axisLine={false} fontSize={10} allowDecimals={false} width={40} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar dataKey="publicados" stackId="p" fill="var(--color-publicados)" radius={[0, 0, 4, 4]} />
                    <Bar dataKey="fallidos" stackId="p" fill="var(--color-fallidos)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              ) : (
                <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                  El publicador no tiene publicaciones en este periodo.
                </div>
              )}
            </Card>
          </div>

          <SortableTable
            title="Por cuenta de Facebook"
            rows={stats.cuentas ?? []}
            columns={accountColumns}
            initialSort="entrantes"
            fileName={`marketplace-cuentas-${desde}-a-${hasta}.csv`}
            rowKey={(row) => row.id}
            empty={stats.cuentas ? "No hay cuentas registradas." : "No cargó la tabla de cuentas."}
          />

          <SortableTable
            title="Por producto"
            rows={stats.productos ?? []}
            columns={productColumns}
            initialSort="chats"
            fileName={`marketplace-productos-${desde}-a-${hasta}.csv`}
            rowKey={(row, index) => `${row.producto}-${index}`}
            empty={stats.productos ? "Sin chats en el periodo." : "No cargó la tabla de productos."}
          />
          <p className="-mt-2 text-[11px] text-muted-foreground">
            El producto es el título del anuncio de Marketplace que guarda el CRM. El código de Gestión solo aparece si el título lo trae o coincide
            con un único producto del inventario de NETMAGI.
          </p>

          {stats.publicador ? <PublicadorSection data={stats.publicador} /> : null}
        </>
      )}
    </section>
  );
}
