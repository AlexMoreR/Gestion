"use client";

import * as React from "react";
import { RotateCcw, X, ZoomIn, ZoomOut } from "lucide-react";

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const STEP = 0.5;

function isPdf(url: string): boolean {
  return /\.pdf(\?|#|$)/i.test(url);
}

// Visor de comprobante en grande (estilo lightbox de WhatsApp) con zoom.
// Imagen: zoom por botones y clic; al ampliar se puede desplazar (scroll).
// PDF: se embebe con el visor nativo del navegador.
export function ReceiptLightbox({ url, onClose }: { url: string | null; onClose: () => void }) {
  const [zoom, setZoom] = React.useState(1);
  const pdf = url ? isPdf(url) : false;

  React.useEffect(() => {
    if (!url) return;
    setZoom(1);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [url, onClose]);

  if (!url) return null;

  const zoomIn = () => setZoom((z) => Math.min(MAX_ZOOM, Math.round((z + STEP) * 100) / 100));
  const zoomOut = () => setZoom((z) => Math.max(MIN_ZOOM, Math.round((z - STEP) * 100) / 100));

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Comprobante"
    >
      {/* Cerrar */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar"
        className="absolute right-4 top-4 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
      >
        <X className="h-5 w-5" />
      </button>

      {/* Controles de zoom (solo imagenes) */}
      {!pdf ? (
        <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full bg-white/10 px-2 py-1 backdrop-blur">
          <button
            type="button"
            onClick={zoomOut}
            disabled={zoom <= MIN_ZOOM}
            aria-label="Alejar"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-white transition hover:bg-white/20 disabled:opacity-40"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="w-12 text-center text-xs tabular-nums text-white">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            onClick={zoomIn}
            disabled={zoom >= MAX_ZOOM}
            aria-label="Acercar"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-white transition hover:bg-white/20 disabled:opacity-40"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setZoom(1)}
            disabled={zoom === 1}
            aria-label="Restablecer zoom"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-white transition hover:bg-white/20 disabled:opacity-40"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {/* Contenido: clic fuera cierra; clic en la imagen alterna zoom */}
      <div className="absolute inset-0 overflow-auto p-4 sm:p-10" onClick={onClose}>
        {pdf ? (
          <iframe
            src={url}
            title="Comprobante"
            className="mx-auto h-[85vh] w-full max-w-4xl rounded-lg border-0 bg-white"
            onClick={(event) => event.stopPropagation()}
          />
        ) : (
          <div className="flex min-h-full items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt="Comprobante"
              onClick={(event) => {
                event.stopPropagation();
                setZoom((z) => (z > 1 ? 1 : 2.5));
              }}
              style={zoom > 1 ? { width: `${zoom * 100}%` } : undefined}
              className={
                zoom > 1
                  ? "max-w-none cursor-zoom-out rounded-lg shadow-2xl"
                  : "max-h-[85vh] max-w-[95vw] cursor-zoom-in rounded-lg object-contain shadow-2xl"
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}
