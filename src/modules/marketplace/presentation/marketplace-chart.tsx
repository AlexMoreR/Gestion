"use client";

import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, XAxis, YAxis } from "recharts";

import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { ChartPoint } from "@/modules/marketplace/domain/marketplace-monitor";
import { Card } from "./marketplace-ui";

const config = {
  publicados: { label: "Anuncios publicados", color: "#10b981" },
  clientes_nuevos: { label: "Clientes nuevos", color: "#3b82f6" },
} satisfies ChartConfig;

// Clientes nuevos y anuncios publicados por dia (30 dias). La linea marca cuando arranco el publicador.
export function TrendChart({ points, startLabel }: { points: ChartPoint[]; startLabel: string | null }) {
  const hasData = points.some((point) => point.publicados > 0 || point.clientes_nuevos > 0);
  return (
    <Card title="Clientes nuevos y anuncios publicados por día (últimos 30 días)">
      {hasData ? (
        <ChartContainer config={config} className="h-64 w-full">
          <ComposedChart accessibilityLayer data={points} margin={{ top: 16, left: -16, right: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontSize={10} minTickGap={16} />
            <YAxis tickLine={false} axisLine={false} fontSize={10} allowDecimals={false} width={40} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey="publicados" fill="var(--color-publicados)" radius={[4, 4, 0, 0]} />
            <Line type="monotone" dataKey="clientes_nuevos" stroke="var(--color-clientes_nuevos)" strokeWidth={2} dot={false} />
            {startLabel ? (
              <ReferenceLine x={startLabel} stroke="currentColor" strokeDasharray="4 3" className="text-muted-foreground" label={{ value: "Arrancó el publicador", position: "insideTopLeft", fontSize: 10, fill: "currentColor" }} />
            ) : null}
          </ComposedChart>
        </ChartContainer>
      ) : (
        <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
          Todavía no hay datos en este periodo.
        </div>
      )}
      <p className="mt-2 text-[11px] text-muted-foreground">
        Barras: anuncios publicados por el publicador ese día. Línea: chats nuevos de Marketplace ese día (vienen de todos los anuncios, también de los publicados a mano y de las
        renovaciones). La línea punteada marca el 23 de octubre, cuando arrancó el publicador.
      </p>
    </Card>
  );
}
