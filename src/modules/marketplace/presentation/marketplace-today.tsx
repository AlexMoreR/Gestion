"use client";

import { cn } from "@/lib/utils";
import type { TodayCard } from "@/modules/marketplace/domain/marketplace-monitor";
import { TONE_DOT, TONE_TEXT } from "./marketplace-ui";

// Solo lo que mas importa del canal hoy, en este orden.
const MAIN_CARDS = ["publicados", "mensajes", "clientes", "whatsapp"];

export function TodayCards({ cards }: { cards: TodayCard[] }) {
  const main = MAIN_CARDS.map((key) => cards.find((card) => card.key === key)).filter((card): card is TodayCard => Boolean(card));
  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
      {main.map((card) => (
        <div key={card.key} className="rounded-xl border border-border bg-card p-3 sm:p-4">
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {card.tone !== "neutral" ? <span className={cn("h-2 w-2 shrink-0 rounded-full", TONE_DOT[card.tone])} aria-hidden /> : null}
            {card.label}
          </p>
          <p className={cn("mt-1 text-3xl font-semibold tabular-nums", card.tone === "neutral" ? "text-foreground" : TONE_TEXT[card.tone])}>{card.value}</p>
          {card.compare ? <p className="mt-1 text-[11px] text-muted-foreground">{card.compare}</p> : null}
        </div>
      ))}
    </div>
  );
}
