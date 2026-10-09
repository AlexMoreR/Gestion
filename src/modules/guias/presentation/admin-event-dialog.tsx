"use client";

import { useState } from "react";
import type { ShipmentStatus } from "@prisma/client";
import { AlertTriangle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { CityOption } from "../domain/types";
import { AdminEventForm } from "./admin-event-form";

type AdminEventDialogProps = {
  shipmentId: string;
  currentStatus: ShipmentStatus;
  action: (formData: FormData) => Promise<void>;
  searchCities: (term: string) => Promise<CityOption[]>;
  suggestions: CityOption[];
  /** Firma de la linea de tiempo (cantidad + ultimo id): si cambia despues de enviar, el evento se guardo. */
  eventsSignature: string;
  /** Mensaje de error que deja la accion en la URL (?error=). */
  errorMessage: string;
};

/**
 * Boton "+ Agregar evento" que abre el formulario en un modal.
 * Computador: dialogo centrado. Celular: hoja desde abajo con scroll interno.
 * La accion del servidor no cambia: redirige con ?ok= o ?error=. Si al terminar
 * aparece un evento nuevo, el modal se cierra; si no, queda abierto con el error.
 */
export function AdminEventDialog({
  shipmentId,
  currentStatus,
  action,
  searchCities,
  suggestions,
  eventsSignature,
  errorMessage,
}: AdminEventDialogProps) {
  const [open, setOpen] = useState(false);
  // undefined = no se ha enviado desde que se abrio el modal.
  const [submittedFrom, setSubmittedFrom] = useState<string | undefined>(undefined);

  const submitted = submittedFrom !== undefined;
  const saved = submitted && eventsSignature !== submittedFrom;
  const isOpen = open && !saved;
  const shownError = submitted && !saved ? errorMessage : "";

  const changeOpen = (next: boolean) => {
    setOpen(next);
    setSubmittedFrom(undefined);
  };

  const submit = async (formData: FormData) => {
    setSubmittedFrom(eventsSignature);
    await action(formData);
  };

  return (
    <>
      <Button type="button" size="sm" onClick={() => changeOpen(true)}>
        <Plus className="h-4 w-4" />
        Agregar evento
      </Button>
      <Dialog open={isOpen} onOpenChange={changeOpen}>
        <DialogContent
          className="top-auto bottom-0 left-0 max-h-[92dvh] w-full max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-b-none data-ending-style:translate-y-10 data-ending-style:scale-100 data-starting-style:translate-y-10 data-starting-style:scale-100 sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:max-h-[90dvh] sm:w-[calc(100%-2rem)] sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:data-ending-style:-translate-y-1/2 sm:data-ending-style:scale-95 sm:data-starting-style:-translate-y-1/2 sm:data-starting-style:scale-95"
        >
          <DialogHeader>
            <DialogTitle>Agregar evento</DialogTitle>
          </DialogHeader>
          {shownError ? (
            <div className="flex items-start gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 p-2 text-sm text-rose-700 dark:text-rose-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {shownError}
            </div>
          ) : null}
          <AdminEventForm
            shipmentId={shipmentId}
            currentStatus={currentStatus}
            action={submit}
            searchCities={searchCities}
            suggestions={suggestions}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
