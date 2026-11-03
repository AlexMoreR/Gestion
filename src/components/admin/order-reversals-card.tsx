import { Undo2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export type OrderReversalView = {
  id: string;
  // Nombre del producto o "Toda la orden".
  product: string;
  fromState: string;
  toState: string;
  // Etiqueta del motivo u "Otro: texto".
  motive: string;
  comment: string | null;
  by: string;
  // "AAAA-MM-DD HH:MM" hora Colombia (formatNoteDate).
  date: string;
};

// Historial de reversas de entrega/despacho (más nueva primero). Solo lectura: no toca dinero ni estados.
export function OrderReversalsCard({ reversals }: { reversals: OrderReversalView[] }) {
  if (reversals.length === 0) return null;
  return (
    <Card className="border-border bg-card/95">
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <Undo2 className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Reversas</h2>
        </div>
        <ul className="space-y-2">
          {reversals.map((reversal) => (
            <li key={reversal.id} className="rounded-lg border border-border bg-muted/30 p-2.5">
              <p className="break-words text-sm font-medium text-foreground">{reversal.product}</p>
              <p className="text-xs text-muted-foreground">
                {reversal.fromState} → {reversal.toState}
              </p>
              <p className="mt-1 break-words text-sm text-foreground">{reversal.motive}</p>
              {reversal.comment ? (
                <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{reversal.comment}</p>
              ) : null}
              <p className="mt-1.5 text-xs text-muted-foreground">
                {reversal.by} · {reversal.date}
              </p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
