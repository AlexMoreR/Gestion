"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";
import { adminUndoDeliveryAction } from "@/app/actions/dispatch-actions";
import { Button } from "@/components/ui/button";

function ConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="destructive" disabled={pending} className="h-8">
      {pending ? "Deshaciendo..." : "Sí, deshacer entrega"}
    </Button>
  );
}

// Paso "Entregar" de la orden: devuelve un despacho marcado como entregado por error a En camino.
export function UndoDeliveryButton({ dispatchId, returnTo }: { dispatchId: string; returnTo: string }) {
  const [asking, setAsking] = React.useState(false);

  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      >
        ¿No se entregó? Deshacer entrega
      </button>
    );
  }

  return (
    <form action={adminUndoDeliveryAction} className="flex flex-wrap items-center gap-2 rounded-lg border border-rose-300/60 bg-rose-500/5 p-2">
      <input type="hidden" name="dispatchId" value={dispatchId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <p className="w-full text-xs text-foreground">
        La orden vuelve a Despachada y el despacho a En camino. Queda anotado en el historial.
      </p>
      <ConfirmButton />
      <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => setAsking(false)}>
        Cancelar
      </Button>
    </form>
  );
}
