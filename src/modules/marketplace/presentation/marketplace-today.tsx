"use client";

import { AlertTriangle, ArrowUp, CheckCircle2, HelpCircle, XCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import type { TodayCard, Tone, Verdict } from "@/modules/marketplace/domain/marketplace-monitor";
import { TONE_BOX, TONE_DOT, TONE_TEXT } from "./marketplace-ui";

const TONE_ICON: Record<Tone, typeof CheckCircle2> = {
  ok: CheckCircle2,
  warn: AlertTriangle,
  bad: XCircle,
  neutral: HelpCircle,
};

// Lo primero que se lee: la respuesta de una linea a "¿esta publicando bien hoy?".
export function VerdictBanner({ verdict, today }: { verdict: Verdict; today: string }) {
  const Icon = TONE_ICON[verdict.tone];
  return (
    <div role="status" className={cn("flex items-start gap-3 rounded-xl border p-4", TONE_BOX[verdict.tone])}>
      <Icon className={cn("mt-0.5 h-6 w-6 shrink-0", TONE_TEXT[verdict.tone])} aria-hidden />
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">¿Está publicando bien hoy? · {today}</p>
        <p className={cn("text-lg font-semibold leading-snug", TONE_TEXT[verdict.tone])}>{verdict.title}</p>
        <ul className="mt-1 space-y-0.5 text-sm text-muted-foreground">
          {verdict.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function TodayCards({ cards }: { cards: TodayCard[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
      {cards.map((card) => (
        <div key={card.key} className={cn("relative rounded-xl border p-3 sm:p-4", TONE_BOX[card.tone])}>
          {card.tone !== "neutral" ? (
            <span className={cn("absolute right-3 top-3 h-2.5 w-2.5 rounded-full", TONE_DOT[card.tone])} aria-hidden />
          ) : null}
          <p className="pr-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{card.label}</p>
          <p className={cn("mt-1 text-3xl font-semibold tabular-nums", TONE_TEXT[card.tone])}>{card.value}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{card.sub}</p>
          {card.compare ? (
            <p className="mt-2 border-t border-border/60 pt-1.5 text-[11px] text-muted-foreground">
              {card.compare}
              {card.reached ? (
                <span className="ml-1 inline-flex items-center gap-0.5 font-medium text-emerald-700 dark:text-emerald-400">
                  <ArrowUp className="h-3 w-3" aria-hidden /> ya igualó a ayer
                </span>
              ) : null}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
