"use client";

import * as React from "react";
import { Bar, BarChart, CartesianGrid, Cell, XAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";
import type { SaleProfit } from "@/modules/balances/domain/entities";

type ProfitChartProps = {
  data: SaleProfit[];
  currency: SupportedCurrencyCode;
};

const chartConfig = {
  netProfit: { label: "Ganancia neta" },
  positive: { label: "Positiva", color: "#10b981" },
  negative: { label: "Negativa", color: "var(--destructive)" },
} satisfies ChartConfig;

export function ProfitChart({ data, currency }: ProfitChartProps) {
  // Datos vienen ordenados por fecha desc; mostramos todas las ventas del
  // periodo de izquierda (mas antigua) a derecha (mas reciente).
  const chartData = [...data].reverse().map((item) => ({
    saleCode: item.saleCode,
    netProfit: item.netProfit,
  }));

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Rentabilidad por venta</h3>
          <p className="text-xs text-muted-foreground">Venta neta por cada venta del periodo.</p>
        </div>
      </div>

      {chartData.length === 0 ? (
        <div className="flex h-48 items-center justify-center rounded-xl border border-border/70 bg-muted/20 text-sm text-muted-foreground">
          Sin datos suficientes.
        </div>
      ) : (
        <ChartContainer config={chartConfig} className="h-48 w-full">
          <BarChart accessibilityLayer data={chartData} margin={{ top: 8, left: 4, right: 4 }}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="saleCode"
              tickLine={false}
              tickMargin={8}
              axisLine={false}
              fontSize={10}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  formatter={(value) => (
                    <div className="flex flex-1 items-center justify-between gap-3">
                      <span className="text-muted-foreground">Ganancia neta</span>
                      <span className="font-mono font-medium tabular-nums text-foreground">
                        {formatMoney(Number(value), currency)}
                      </span>
                    </div>
                  )}
                />
              }
            />
            <Bar dataKey="netProfit" radius={[8, 8, 4, 4]}>
              {chartData.map((entry) => (
                <Cell
                  key={entry.saleCode}
                  fill={entry.netProfit >= 0 ? "var(--color-positive)" : "var(--color-negative)"}
                />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      )}
    </div>
  );
}
