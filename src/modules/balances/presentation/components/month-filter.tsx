"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

type MonthFilterProps = {
  // Mes seleccionado en formato YYYY-MM.
  value: string;
  // Etiqueta legible del mes (ej. "junio 2026").
  label: string;
};

function shiftMonth(value: string, delta: number): string {
  const [year, month] = value.split("-").map(Number);
  // month es 1-based; Date normaliza el desborde de mes/año automáticamente.
  const next = new Date(year, month - 1 + delta, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
}

export function MonthFilter({ value, label }: MonthFilterProps) {
  const router = useRouter();

  const goTo = React.useCallback(
    (month: string) => {
      router.push(`/admin/balances?month=${month}`);
    },
    [router],
  );

  return (
    <div className="flex items-center gap-1.5">
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        onClick={() => goTo(shiftMonth(value, -1))}
        aria-label="Mes anterior"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <label className="relative inline-flex cursor-pointer items-center rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium capitalize text-foreground hover:bg-accent">
        {label}
        <input
          type="month"
          value={value}
          onChange={(event) => {
            if (event.target.value) {
              goTo(event.target.value);
            }
          }}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label="Seleccionar mes"
        />
      </label>

      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        onClick={() => goTo(shiftMonth(value, 1))}
        aria-label="Mes siguiente"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
