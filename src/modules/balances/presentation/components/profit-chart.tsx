"use client";

import type { SaleProfit } from "@/modules/balances/domain/entities";

type ProfitChartProps = {
  data: SaleProfit[];
};

export function ProfitChart({ data }: ProfitChartProps) {
  const visible = [...data].slice(0, 8).reverse();
  const values = visible.map((item) => item.netProfit);
  const max = Math.max(1, ...values.map((value) => Math.abs(value)));
  const width = 640;
  const height = 180;
  const gap = 14;
  const barWidth = visible.length > 0 ? (width - gap * (visible.length + 1)) / visible.length : 0;

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Rentabilidad reciente</h3>
          <p className="text-xs text-muted-foreground">Venta neta por cada pedido reciente.</p>
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-border/70 bg-muted/20 p-3">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-48 w-full">
          <line x1="0" y1={height - 1} x2={width} y2={height - 1} stroke="currentColor" className="text-border" />
          {visible.map((item, index) => {
            const value = item.netProfit;
            const normalized = Math.abs(value) / max;
            const barHeight = Math.max(8, normalized * (height - 48));
            const x = gap + index * (barWidth + gap);
            const y = height - 24 - barHeight;
            const positive = value >= 0;

            return (
              <g key={item.saleId}>
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  rx="12"
                  className={positive ? "fill-emerald-500/80" : "fill-destructive/70"}
                />
                <text
                  x={x + barWidth / 2}
                  y={height - 8}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[10px]"
                >
                  {item.saleCode}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
