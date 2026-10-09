"use client";

import { useRef } from "react";
import { ArrowUpRight, MoreHorizontal } from "lucide-react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type FormAction = (formData: FormData) => void | Promise<void>;

function MenuTrigger({ label }: { label: string }) {
  return (
    <DropdownMenuTrigger asChild>
      <Button type="button" variant="ghost" size="icon-sm" aria-label={label} title={label} className="shrink-0">
        <MoreHorizontal className="h-4 w-4" />
      </Button>
    </DropdownMenuTrigger>
  );
}

// Menu de tres puntos del transportador: WhatsApp, generar enlace nuevo y activar/desactivar.
// Las dos ultimas usan formularios ocultos para conservar el server action (y su mensaje de resultado).
export function CarrierLinkMenu({
  shipmentId,
  carrierMessage,
  active,
  regenerateAction,
  setActiveAction,
}: {
  shipmentId: string;
  carrierMessage: string;
  active: boolean;
  regenerateAction: FormAction;
  setActiveAction: FormAction;
}) {
  const regenerateForm = useRef<HTMLFormElement>(null);
  const toggleForm = useRef<HTMLFormElement>(null);

  return (
    <>
      <form ref={regenerateForm} action={regenerateAction} className="hidden">
        <input type="hidden" name="shipmentId" value={shipmentId} />
      </form>
      <form ref={toggleForm} action={setActiveAction} className="hidden">
        <input type="hidden" name="shipmentId" value={shipmentId} />
        <input type="hidden" name="active" value={active ? "0" : "1"} />
      </form>
      <DropdownMenu>
        <MenuTrigger label="Más opciones del transportador" />
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <a href={`https://wa.me/?text=${encodeURIComponent(carrierMessage)}`} target="_blank" rel="noreferrer">
              Enviar por WhatsApp
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => regenerateForm.current?.requestSubmit()}>Generar enlace nuevo</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => toggleForm.current?.requestSubmit()}>
            {active ? "Desactivar enlace" : "Activar enlace"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

async function copyText(value: string, toastText: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(toastText);
  } catch {
    toast.error("No se pudo copiar");
  }
}

// Menu de tres puntos del cliente: abrir guia (estado del envio), abrir el documento formal,
// copiar solo el enlace directo y el enlace de consulta.
export function ClientLinkMenu({
  directUrl,
  documentUrl,
  publicUrl,
}: {
  directUrl: string | null;
  documentUrl: string | null;
  publicUrl: string;
}) {
  return (
    <DropdownMenu>
      <MenuTrigger label="Más opciones del cliente" />
      <DropdownMenuContent align="end">
        {directUrl ? (
          <>
            <DropdownMenuItem asChild>
              <a href={directUrl} target="_blank" rel="noreferrer" className="gap-1">
                Abrir guía <ArrowUpRight className="h-3 w-3" />
              </a>
            </DropdownMenuItem>
            {documentUrl ? (
              <DropdownMenuItem asChild>
                <a href={documentUrl} target="_blank" rel="noreferrer" className="gap-1">
                  Abrir documento de la guía <ArrowUpRight className="h-3 w-3" />
                </a>
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onSelect={() => void copyText(directUrl, "Copiado")}>
              Copiar solo el enlace directo
            </DropdownMenuItem>
          </>
        ) : null}
        <DropdownMenuItem onSelect={() => void copyText(publicUrl, "Copiado")}>Copiar enlace de consulta</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
