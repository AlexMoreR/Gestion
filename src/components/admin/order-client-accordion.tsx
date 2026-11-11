"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "orden-cliente-abierto";

type OrderClientAccordionProps = {
  /** Línea 1, a la izquierda: código, venta y estado. */
  title: React.ReactNode;
  summary: React.ReactNode;
  actions: React.ReactNode;
  children: React.ReactNode;
};

// Encabezado de la orden en dos líneas. Los botones van fuera del <button> que pliega: funcionan sin abrirlo.
export function OrderClientAccordion({ title, summary, actions, children }: OrderClientAccordionProps) {
  const [open, setOpen] = React.useState(false);
  const panelId = React.useId();

  // Se lee después de montar para que el servidor y el primer render coincidan (cerrado).
  React.useEffect(() => {
    try {
      setOpen(window.localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      // Sin localStorage queda cerrado.
    }
  }, []);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      // Sin localStorage la elección dura solo en esta orden.
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">{title}</div>
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      </div>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="mt-1 flex min-w-0 max-w-full items-start gap-1.5 rounded-md text-left text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronDown
          className={cn(
            "mt-px h-3.5 w-3.5 shrink-0 transition-transform duration-200 motion-reduce:transition-none",
            open && "rotate-180",
          )}
        />
        <span className="min-w-0 break-words">{summary}</span>
      </button>
      <div
        id={panelId}
        inert={!open}
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="pt-2">
            <div className="rounded-xl border border-border bg-card/95 p-4 text-sm">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
