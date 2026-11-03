"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";
import { StickyNote, Trash2 } from "lucide-react";
import { adminAddOrderNoteAction, adminDeleteOrderNoteAction } from "@/app/actions/orders-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ORDER_NOTE_MAX } from "@/lib/order-notes";

export type OrderNoteView = {
  id: string;
  text: string;
  by: string;
  // "AAAA-MM-DD HH:MM" hora Colombia (formatNoteDate).
  date: string;
  mine: boolean;
};

function AddNoteButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Guardando..." : "Agregar nota"}
    </Button>
  );
}

// Notas internas del equipo sobre la orden: solo en el panel, nunca al cliente ni a la proveedora.
export function OrderNotesCard({ orderId, notes }: { orderId: string; notes: OrderNoteView[] }) {
  return (
    <Card className="border-border bg-card/95">
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <StickyNote className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Notas</h2>
        </div>

        <form action={adminAddOrderNoteAction} className="space-y-2">
          <input type="hidden" name="orderId" value={orderId} />
          <Textarea
            name="text"
            required
            maxLength={ORDER_NOTE_MAX}
            rows={2}
            aria-label="Nueva nota"
            placeholder="Ej.: esperando guía de Eliecer"
          />
          <div className="flex justify-end">
            <AddNoteButton />
          </div>
        </form>

        {notes.length === 0 ? (
          <p className="text-xs text-muted-foreground">Aún no hay notas en esta orden.</p>
        ) : (
          <ul className="space-y-2">
            {notes.map((note) => (
              <li key={note.id} className="rounded-lg border border-border bg-muted/30 p-2.5">
                <p className="whitespace-pre-wrap break-words text-sm text-foreground">{note.text}</p>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    {note.by} · {note.date}
                  </p>
                  {note.mine ? (
                    <form
                      action={adminDeleteOrderNoteAction}
                      onSubmit={(event) => {
                        if (!window.confirm("¿Borrar esta nota?")) event.preventDefault();
                      }}
                    >
                      <input type="hidden" name="noteId" value={note.id} />
                      <Button type="submit" variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive">
                        <Trash2 className="mr-1 h-3.5 w-3.5" />
                        Borrar
                      </Button>
                    </form>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
