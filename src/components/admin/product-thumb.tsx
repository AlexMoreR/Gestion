"use client";

import * as React from "react";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

type ProductThumbProps = {
  src: string;
  alt: string;
  className?: string;
};

/**
 * Imagen de producto con respaldo: si la URL no carga (archivo faltante,
 * 404 en desarrollo, etc.) muestra un recuadro con icono en vez de la
 * imagen rota.
 */
export function ProductThumb({ src, alt, className }: ProductThumbProps) {
  const [failed, setFailed] = React.useState(false);

  if (!src || failed) {
    return (
      <div className={cn("flex items-center justify-center bg-slate-100 text-slate-400", className)}>
        <ImageOff className="h-5 w-5" />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className={className} onError={() => setFailed(true)} />
  );
}
