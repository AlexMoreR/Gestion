"use client";

import * as React from "react";
import { ImageOff } from "lucide-react";
import { imageVariantUrl } from "@/lib/image-variants";
import { cn } from "@/lib/utils";

type ProductThumbProps = {
  src: string;
  alt: string;
  className?: string;
};

/**
 * Imagen de producto con respaldo: usa la miniatura de 400 px; si no carga,
 * prueba con el original y, si tampoco (archivo faltante, 404 en desarrollo,
 * etc.), muestra un recuadro con icono en vez de la imagen rota.
 */
export function ProductThumb({ src, alt, className }: ProductThumbProps) {
  const thumbSrc = imageVariantUrl(src, "thumb");
  const [attempt, setAttempt] = React.useState<"thumb" | "original" | "failed">("thumb");

  if (!src || attempt === "failed") {
    return (
      <div className={cn("flex items-center justify-center bg-slate-100 text-slate-400", className)}>
        <ImageOff className="h-5 w-5" />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={attempt === "thumb" ? thumbSrc : src}
      alt={alt}
      className={className}
      loading="lazy"
      decoding="async"
      onError={() => setAttempt(attempt === "thumb" && thumbSrc !== src ? "original" : "failed")}
    />
  );
}
