"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";

type CopyButtonProps = {
  value: string;
  label: string;
  toastText?: string;
  // Solo el icono: el texto queda como aria-label y tooltip (title).
  iconOnly?: boolean;
  disabled?: boolean;
};

// Copia un texto (enlace o mensaje) al portapapeles.
export function CopyButton({ value, label, toastText, iconOnly = false, disabled = false }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(toastText ?? "Copiado");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("No se pudo copiar");
    }
  };

  const icon = copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />;

  if (iconOnly) {
    return (
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={handleCopy}
        disabled={disabled}
        aria-label={label}
        title={label}
        className="shrink-0"
      >
        {icon}
      </Button>
    );
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={handleCopy} disabled={disabled} className="gap-1.5">
      {icon}
      {label}
    </Button>
  );
}
