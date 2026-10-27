"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import type { Tone } from "@/modules/marketplace/domain/marketplace-monitor";

// Piezas compartidas del panel /admin/marketplace. Mismo estilo que el resto del admin
// (bordes, bg-card, text-muted-foreground) y con variantes para modo oscuro.

// Miles con punto, sin Intl (servidor y navegador pintan lo mismo).
export const fmt = (value: number) => String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

export function Card({ title, children, className, action }: { title?: string; children: React.ReactNode; className?: string; action?: React.ReactNode }) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-4", className)}>
      {title || action ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title ? <h2 className="text-sm font-semibold text-foreground">{title}</h2> : <span />}
          {action}
        </div>
      ) : null}
      {children}
    </div>
  );
}

// Semaforo: colores con variante oscura. El texto siempre acompana al color (no solo color).
export const TONE_DOT: Record<Tone, string> = {
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  bad: "bg-red-500",
  neutral: "bg-muted-foreground/40",
};

export const TONE_BOX: Record<Tone, string> = {
  ok: "border-emerald-500/40 bg-emerald-500/10",
  warn: "border-amber-500/50 bg-amber-500/10",
  bad: "border-red-500/50 bg-red-500/10",
  neutral: "border-border bg-card",
};

export const TONE_TEXT: Record<Tone, string> = {
  ok: "text-emerald-700 dark:text-emerald-400",
  warn: "text-amber-700 dark:text-amber-400",
  bad: "text-red-700 dark:text-red-400",
  neutral: "text-foreground",
};

export function downloadCsv(fileName: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export const FIELD_CLASS =
  "h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground [color-scheme:light_dark] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
