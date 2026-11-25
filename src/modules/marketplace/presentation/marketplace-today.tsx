"use client";

import { Megaphone, MessageCircle, MessagesSquare, UserPlus, type LucideIcon } from "lucide-react";

import { StatList, type StatTone } from "@/components/ui/stat-list";
import type { TodayCard, Tone } from "@/modules/marketplace/domain/marketplace-monitor";

// Solo lo que mas importa del canal hoy, en este orden, con la misma lista de estadisticas del resto de la app.
const MAIN_CARDS: { key: string; icon: LucideIcon }[] = [
  { key: "publicados", icon: Megaphone },
  { key: "mensajes", icon: MessagesSquare },
  { key: "clientes", icon: UserPlus },
  { key: "whatsapp", icon: MessageCircle },
];

const STAT_TONE: Record<Tone, StatTone> = { ok: "success", bad: "danger", warn: "neutral", neutral: "neutral" };

export function TodayCards({ cards }: { cards: TodayCard[] }) {
  const items = MAIN_CARDS.flatMap(({ key, icon }) => {
    const card = cards.find((c) => c.key === key);
    return card ? [{ label: card.label, value: card.value, icon, tone: STAT_TONE[card.tone], helper: card.compare ?? undefined }] : [];
  });
  return <StatList items={items} />;
}
