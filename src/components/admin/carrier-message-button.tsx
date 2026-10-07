"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";

type CarrierMessageButtonProps = {
  message: string;
  disabled?: boolean;
};

// Copia al portapapeles el mensaje listo para enviarle a la transportadora.
export function CarrierMessageButton({ message, disabled }: CarrierMessageButtonProps) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      toast.success("Mensaje copiado");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("No se pudo copiar el mensaje");
    }
  };

  return (
    <Button type="button" variant="outline" size="sm" onClick={handleCopy} disabled={disabled} className="gap-1.5">
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      Copiar mensaje
    </Button>
  );
}
