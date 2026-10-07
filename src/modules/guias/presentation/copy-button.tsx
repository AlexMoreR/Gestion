"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";

// Copia un texto (enlace o mensaje) al portapapeles.
export function CopyButton({ value, label, toastText }: { value: string; label: string; toastText?: string }) {
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

  return (
    <Button type="button" variant="outline" size="sm" onClick={handleCopy} className="gap-1.5">
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {label}
    </Button>
  );
}
