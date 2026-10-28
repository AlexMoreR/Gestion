"use client";

import { FlaskConical } from "lucide-react";

import { cn } from "@/lib/utils";
import { formulaVerdict } from "@/modules/marketplace/domain/marketplace-monitor";
import type { Formula, FormulaGrupo } from "@/modules/marketplace/domain/marketplace-stats";
import { Card, fmt, TONE_BOX, TONE_TEXT } from "./marketplace-ui";

// "Qué funciona": qué título (y qué producto o categoría) trae más clientes. NETMAGI prueba varias fórmulas
// de título, mide cuál trae más y usa la mejor 8 de cada 10 veces. Solo lectura; los datos vienen de /formula.

const decimal = (value: number) => String(Math.round(value * 100) / 100).replace(".", ",");

function Groups({ title, rows, variantNames }: { title: string; rows: FormulaGrupo[]; variantNames: Map<string, string> }) {
  return (
    <div className="min-w-0">
      <h3 className="mb-1 text-xs font-semibold text-foreground">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sin anuncios en el periodo.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[320px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-1.5 pr-3 font-medium">Nombre</th>
                <th className="py-1.5 pr-3 text-right font-medium">Anuncios</th>
                <th className="py-1.5 pr-3 text-right font-medium">Clientes</th>
                <th className="py-1.5 text-right font-medium">Por anuncio</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 8).map((row) => (
                <tr key={row.nombre} className="border-b border-border/60 last:border-0">
                  <td className="max-w-[240px] truncate py-1.5 pr-3 text-foreground" title={row.nombre}>
                    {row.nombre}
                    {row.mejor_variante ? (
                      <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground" title="Fórmula que mejor le funciona">
                        {variantNames.get(row.mejor_variante) ?? row.mejor_variante}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{fmt(row.anuncios)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{fmt(row.clientes)}</td>
                  <td className="py-1.5 text-right font-medium tabular-nums">{decimal(row.clientes_por_anuncio)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function FormulaSection({ formula, faltan }: { formula: Formula | null; faltan: boolean }) {
  if (!formula) {
    return (
      <Card title="Qué funciona">
        <p className="text-xs text-muted-foreground">
          {faltan
            ? "NETMAGI todavía no tiene esta sección (falta desplegar la fórmula de venta). Cuando esté, aquí verás qué título trae más clientes."
            : "No se pudo traer el análisis de títulos de NETMAGI."}
        </p>
      </Card>
    );
  }

  const verdict = formulaVerdict(formula);
  const names = new Map(formula.variantes.map((variant) => [variant.variante, variant.nombre]));
  const attributed = formula.atribucion.id + formula.atribucion.titulo_exacto + formula.atribucion.titulo_aproximado;
  const signalLabel = formula.senal === "clientes" ? "clientes" : formula.senal === "mensajes" ? "mensajes de Facebook" : formula.senal === "clics" ? "clics" : null;
  const reading = formula.metricas.cuentas.filter((account) => account.anuncios_vistos > 0);

  return (
    <Card
      title="Qué funciona"
      action={
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <FlaskConical className="h-3.5 w-3.5" aria-hidden /> Fórmula de venta
        </span>
      }
    >
      <div role="status" className={cn("rounded-lg border p-3", TONE_BOX[verdict.tone])}>
        <p className={cn("text-sm font-semibold", TONE_TEXT[verdict.tone])}>{verdict.title}</p>
        {verdict.reasons.length > 0 ? (
          <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
            {verdict.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="py-2 pr-3 font-medium">Fórmula de título</th>
              <th className="py-2 pr-3 text-right font-medium">Anuncios</th>
              <th className="py-2 pr-3 text-right font-medium">Clics</th>
              <th className="py-2 pr-3 text-right font-medium">Mensajes</th>
              <th className="py-2 pr-3 text-right font-medium">Clientes</th>
              <th className="py-2 pr-3 text-right font-medium">Tasa</th>
              <th className="py-2 text-right font-medium">Datos</th>
            </tr>
          </thead>
          <tbody>
            {formula.variantes.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-4 text-center text-xs text-muted-foreground">
                  Todavía no hay anuncios con fórmula de título.
                </td>
              </tr>
            ) : (
              formula.variantes.map((variant) => {
                const wins = formula.ganadora?.variante === variant.variante;
                return (
                  <tr key={variant.variante} className={cn("border-b border-border/60 last:border-0", wins && "bg-emerald-500/5")}>
                    <td className="py-2 pr-3 font-medium text-foreground">
                      {variant.nombre}
                      {wins ? <span className="ml-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">ganadora</span> : null}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{fmt(variant.anuncios)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{variant.con_clics > 0 ? fmt(variant.clics) : "—"}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{variant.con_mensajes > 0 ? fmt(variant.mensajes) : "—"}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{fmt(variant.clientes)}</td>
                    <td className="py-2 pr-3 text-right font-medium tabular-nums">{decimal(variant.tasa)}</td>
                    <td className="py-2 text-right text-xs">
                      {variant.suficiente ? <span className="text-emerald-700 dark:text-emerald-400">suficientes</span> : <span className="text-muted-foreground">faltan {variant.faltan}</span>}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Tasa = {signalLabel ?? "la señal disponible"} por anuncio (prioridad: clientes atribuidos, luego mensajes y clics). Una fórmula solo puede ganar con
        {" "}{formula.config.min_anuncios || formula.faltan.minimo} anuncios y comparando con otra. Con pocos datos, un resultado puede ser azar.
      </p>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Groups title="Mejores categorías" rows={formula.porCategoria} variantNames={names} />
        <Groups title="Mejores productos" rows={formula.porProducto} variantNames={names} />
      </div>

      <div className="mt-4 space-y-1 border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
        {attributed > 0 ? (
          <p>
            Cómo se unió cada cliente con su anuncio: {fmt(formula.atribucion.id)} por el id del anuncio, {fmt(formula.atribucion.titulo_exacto)} por título exacto y{" "}
            {fmt(formula.atribucion.titulo_aproximado)} por título aproximado
            {formula.atribucion.pct_exacta != null ? ` (${formula.atribucion.pct_exacta} % exacta)` : ""}.
          </p>
        ) : null}
        <p>
          Lectura de Facebook (clics y mensajes):{" "}
          {formula.metricas.confirmadas
            ? `ya hay cifras de ${reading.filter((account) => account.con_metricas > 0).length} cuenta(s).`
            : reading.length > 0
              ? "se leyó Tus publicaciones, pero todavía no se reconoció ninguna cifra."
              : "todavía no se ha leído ninguna cuenta."}
        </p>
      </div>
    </Card>
  );
}
