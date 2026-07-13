import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type StatTone = "neutral" | "success" | "danger" | "info";

export type StatItem = {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: StatTone;
  // Texto secundario opcional (ej. "12% de margen"); se muestra pequeno bajo la etiqueta.
  helper?: string;
};

// Color del valor: solo verde/rojo aportan significado; el resto queda neutro.
function valueToneClass(tone?: StatTone): string {
  if (tone === "success") return "text-emerald-600 dark:text-emerald-400";
  if (tone === "danger") return "text-rose-600 dark:text-rose-400";
  return "text-foreground";
}

// Color del icono: acompana al tono; "info" usa el color primario.
function iconToneClass(tone?: StatTone): string {
  if (tone === "success") return "text-emerald-600 dark:text-emerald-400";
  if (tone === "danger") return "text-rose-600 dark:text-rose-400";
  if (tone === "info") return "text-primary";
  return "text-muted-foreground";
}

// Lista compacta de estadisticas: cada fila con icono pequeno + etiqueta a la
// izquierda y el valor a la derecha, todas dentro de un mismo contenedor.
export function StatList({ items, className }: { items: StatItem[]; className?: string }) {
  return (
    <div
      className={cn(
        "divide-y divide-border overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10",
        className,
      )}
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div key={item.label} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <Icon className={cn("h-4 w-4 shrink-0", iconToneClass(item.tone))} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{item.label}</p>
                {item.helper ? (
                  <p className="truncate text-[11px] text-muted-foreground">{item.helper}</p>
                ) : null}
              </div>
            </div>
            <span className={cn("shrink-0 text-sm font-semibold", valueToneClass(item.tone))}>
              {item.value}
            </span>
          </div>
        );
      })}
    </div>
  );
}
