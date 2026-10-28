"use client";

import { useEffect, useRef, useState } from "react";
import { X, ZoomIn } from "lucide-react";
import { imageVariantUrl } from "@/lib/image-variants";

type Ficha = { id: string; src: string; alt: string };

// Fichas tecnicas en la tienda: miniatura que se amplia al tocarla (dialogo nativo).
// Sin JavaScript el enlace abre la imagen completa en otra pestana.
export function ProductFichaTecnica({ fichas }: { fichas: Ficha[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [abierta, setAbierta] = useState<Ficha | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (abierta && !dialog.open) dialog.showModal();
    if (!abierta && dialog.open) dialog.close();
  }, [abierta]);

  if (fichas.length === 0) return null;

  return (
    <>
      <div className={fichas.length > 1 ? "grid gap-3 sm:grid-cols-2" : "grid gap-3"}>
        {fichas.map((ficha) => (
          <a
            key={ficha.id}
            href={ficha.src}
            target="_blank"
            rel="noopener"
            onClick={(event) => {
              event.preventDefault();
              setAbierta(ficha);
            }}
            className="group relative block overflow-hidden rounded-2xl border border-[var(--line)] bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
            aria-label={`${ficha.alt}. Toca para ampliar`}
          >
            <img
              src={imageVariantUrl(ficha.src, "large")}
              alt={ficha.alt}
              loading="lazy"
              decoding="async"
              className="w-full cursor-zoom-in bg-white object-contain"
            />
            <span className="pointer-events-none absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/65 px-2.5 py-1 text-xs font-semibold text-white">
              <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" />
              Ampliar
            </span>
          </a>
        ))}
      </div>

      <dialog
        ref={dialogRef}
        onClose={() => setAbierta(null)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setAbierta(null);
        }}
        className="m-auto max-h-[95vh] max-w-[95vw] rounded-2xl bg-white p-0 backdrop:bg-black/80"
        aria-label={abierta?.alt ?? "Ficha técnica"}
      >
        {abierta ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => setAbierta(null)}
              className="absolute right-2 top-2 grid h-10 w-10 place-items-center rounded-full bg-black/70 text-white"
              aria-label="Cerrar"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
            <img src={abierta.src} alt={abierta.alt} className="block max-h-[95vh] max-w-[95vw] object-contain" />
          </div>
        ) : null}
      </dialog>
    </>
  );
}
