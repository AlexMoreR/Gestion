"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "orden-cliente-abierto";

type OrderClientAccordionProps = {
  summary: React.ReactNode;
  actions: React.ReactNode;
  children: React.ReactNode;
};

// Los botones van fuera del <button> que pliega: funcionan sin abrirlo.
export function OrderClientAccordion({ summary, actions, children }: OrderClientAccordionProps) {
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
    <>
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-4">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-md text-left outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none",
              open && "rotate-180",
            )}
          />
          <span className="min-w-0 truncate">{summary}</span>
        </button>
        <div className="flex flex-wrap items-center gap-2 lg:shrink-0">{actions}</div>
      </div>
      <div
        id={panelId}
        inert={!open}
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="pt-4">{children}</div>
        </div>
      </div>
    </>
  );
}
