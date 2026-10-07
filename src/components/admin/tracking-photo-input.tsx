"use client";

import * as React from "react";
import { Camera, Check } from "lucide-react";
import { cn } from "@/lib/utils";

// Foto obligatoria de la guia de la transportadora: boton claro con el nombre del archivo elegido.
// El input queda visualmente oculto (no display:none) para que "required" siga avisando.
export function TrackingPhotoInput({ name = "trackingPhoto" }: { name?: string }) {
  const [fileName, setFileName] = React.useState("");

  return (
    <label
      className={cn(
        "relative inline-flex h-8 min-w-0 max-w-full cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-sm font-medium",
        fileName
          ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          : "border-dashed border-border bg-background text-foreground hover:bg-muted",
      )}
    >
      {fileName ? <Check className="h-4 w-4 shrink-0" /> : <Camera className="h-4 w-4 shrink-0" />}
      <span className="truncate">{fileName || "Foto de la guía"}</span>
      <input
        name={name}
        type="file"
        accept="image/*"
        required
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        onChange={(event) => setFileName(event.currentTarget.files?.[0]?.name ?? "")}
      />
    </label>
  );
}
