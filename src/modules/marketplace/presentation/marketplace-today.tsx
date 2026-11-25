"use client";

import { Inbox, Megaphone, MessageCircle, Reply, type LucideIcon } from "lucide-react";

import { StatList, type StatTone } from "@/components/ui/stat-list";
import type { TodayCard, Tone } from "@/modules/marketplace/domain/marketplace-monitor";

// Solo lo que mas importa del canal hoy, en este orden, con la misma lista de estadisticas del resto de la app.
const MAIN_CARDS: { key: string; label: string; icon: LucideIcon }[] = [
  { key: "publicados", label: "Publicados", icon: Megaphone },
  { key: "mensajes", label: "Entrantes", icon: Inbox },
  { key: "respuestas", label: "Respuestas", icon: Reply },
  { key: "whatsapp", label: "WhatsApp", icon: MessageCircle },
];

const STAT_TONE: Record<Tone, StatTone> = { ok: "success", bad: "danger", warn: "neutral", neutral: "neutral" };

export function TodayCards({ cards }: { cards: TodayCard[] }) {
  const items = MAIN_CARDS.flatMap(({ key, label, icon }) => {
    const card = cards.find((c) => c.key === key);
    return card ? [{ label, value: card.value, icon, tone: STAT_TONE[card.tone], helper: card.compare ?? undefined }] : [];
  });
  return <StatList items={items} />;
}
