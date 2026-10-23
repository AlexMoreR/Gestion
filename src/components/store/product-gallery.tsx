"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight, Maximize2, X } from "lucide-react";

import { imageVariantUrl } from "@/lib/image-variants";
import { getPublicAssetUrl } from "@/lib/site";

type ProductGalleryProps = {
  name: string;
  images: string[];
};

// Galeria de la ficha: carrusel nativo (scroll-snap, sin librerias), contador "1 / N",
// miniaturas y visor a pantalla completa con zoom (<dialog>). La foto 1 es el LCP.
export function ProductGallery({ name, images }: ProductGalleryProps) {
  const gallery = useMemo(
    () =>
      Array.from(
        new Set(
          images
            .map((value) => value.trim())
            .filter(Boolean)
            .map((value) => getPublicAssetUrl(value)),
        ),
      ),
    [images],
  );

  const trackRef = useRef<HTMLDivElement>(null);
  const thumbsRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const total = gallery.length;

  const goTo = useCallback(
    (index: number) => {
      const track = trackRef.current;
      if (!track || total === 0) {
        return;
      }
      const next = (index + total) % total;
      track.scrollTo({ left: next * track.clientWidth, behavior: "smooth" });
    },
    [total],
  );

  useEffect(() => {
    const track = trackRef.current;
    if (!track) {
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const width = track.clientWidth || 1;
        setActiveIndex(Math.min(total - 1, Math.max(0, Math.round(track.scrollLeft / width))));
      }, 60);
    };
    track.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      clearTimeout(timer);
      track.removeEventListener("scroll", onScroll);
    };
  }, [total]);

  // La miniatura activa siempre a la vista (sin mover la pagina).
  useEffect(() => {
    const strip = thumbsRef.current;
    const thumb = strip?.children[activeIndex] as HTMLElement | undefined;
    if (strip && thumb) {
      const left = thumb.offsetLeft - strip.offsetLeft;
      if (left < strip.scrollLeft || left + thumb.offsetWidth > strip.scrollLeft + strip.clientWidth) {
        strip.scrollTo({ left: Math.max(0, left - 8), behavior: "smooth" });
      }
    }
  }, [activeIndex]);

  function openViewer(index: number) {
    setViewerIndex(index);
    setZoomed(false);
    const dialog = dialogRef.current;
    if (dialog && !dialog.open && typeof dialog.showModal === "function") {
      dialog.showModal();
    }
  }

  function closeViewer() {
    dialogRef.current?.close();
  }

  function onTrackKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      goTo(activeIndex + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      goTo(activeIndex - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      openViewer(activeIndex);
    }
  }

  if (total === 0) {
    return (
      <div className="-mx-4 overflow-hidden bg-card sm:mx-0 sm:rounded-2xl sm:border sm:border-[var(--line)]">
        <div className="grid aspect-square place-items-center text-sm text-muted-foreground lg:aspect-[5/4]">
          Sin imagen disponible
        </div>
      </div>
    );
  }

  const viewerUrl = viewerIndex != null ? gallery[viewerIndex] : null;

  return (
    <div className="-mx-4 min-w-0 sm:mx-0">
      <div className="relative overflow-hidden bg-white sm:rounded-2xl sm:border sm:border-[var(--line)]">
        <div
          ref={trackRef}
          tabIndex={0}
          role="region"
          aria-roledescription="carrusel"
          aria-label={`Fotos de ${name}. Usa las flechas para cambiar y Enter para ampliar.`}
          onKeyDown={onTrackKeyDown}
          className="no-scrollbar flex aspect-square snap-x snap-mandatory overflow-x-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--primary)] lg:aspect-[5/4]"
        >
          {gallery.map((url, index) => (
            <button
              key={`${url}-${index}`}
              type="button"
              tabIndex={-1}
              onClick={() => openViewer(index)}
              aria-label={`Ampliar foto ${index + 1} de ${total}`}
              className="grid h-full w-full shrink-0 basis-full cursor-zoom-in snap-center place-items-center bg-white p-0"
            >
              <img
                src={imageVariantUrl(url, "large")}
                alt={`${name}, foto ${index + 1}`}
                loading={index === 0 ? "eager" : "lazy"}
                // La foto 1 es lo mas grande al abrir la ficha (LCP): que el navegador la baje primero.
                fetchPriority={index === 0 ? "high" : "auto"}
                decoding="async"
                draggable={false}
                className="h-full w-full object-contain"
              />
            </button>
          ))}
        </div>

        {total > 1 ? (
          <>
            <button
              type="button"
              onClick={() => goTo(activeIndex - 1)}
              aria-label="Foto anterior"
              className="absolute left-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-slate-900 shadow-md transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] lg:grid"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => goTo(activeIndex + 1)}
              aria-label="Foto siguiente"
              className="absolute right-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-slate-900 shadow-md transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] lg:grid"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        ) : null}

        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 text-xs font-semibold text-white"
        >
          <Maximize2 className="h-3.5 w-3.5" /> Toca para ampliar
        </span>
        <span
          aria-live="polite"
          className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-black/70 px-2.5 py-1 text-xs font-semibold text-white"
        >
          {activeIndex + 1} / {total}
        </span>
      </div>

      {total > 1 ? (
        <div
          ref={thumbsRef}
          aria-label="Miniaturas"
          className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-0.5 pt-2.5 sm:px-0 sm:pt-3"
        >
          {gallery.map((url, index) => {
            const active = index === activeIndex;
            return (
              <button
                key={`${url}-${index}`}
                type="button"
                onClick={() => goTo(index)}
                aria-label={`Ver foto ${index + 1}`}
                aria-current={active ? "true" : undefined}
                className={`h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 bg-white p-0 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] ${
                  active ? "border-foreground opacity-100" : "border-transparent opacity-70 hover:opacity-100"
                }`}
              >
                <img
                  src={imageVariantUrl(url, "thumb")}
                  alt=""
                  className="h-full w-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
              </button>
            );
          })}
        </div>
      ) : null}

      <dialog
        ref={dialogRef}
        aria-label={`Foto ampliada de ${name}`}
        onClose={() => {
          setViewerIndex(null);
          setZoomed(false);
        }}
        onClick={(event) => {
          // Clic en el fondo (fuera de la foto) cierra el visor.
          if (event.target === event.currentTarget) {
            closeViewer();
          }
        }}
        className="m-0 h-dvh max-h-none w-screen max-w-none bg-[#0d0d10] p-0 backdrop:bg-[#0d0d10]"
      >
        {viewerUrl ? (
          <div
            className={`grid h-full w-full overflow-auto ${zoomed ? "place-items-start" : "place-items-center"}`}
            style={{ touchAction: "pinch-zoom" }}
          >
            <img
              src={imageVariantUrl(viewerUrl, "large")}
              alt={`${name}, foto ${(viewerIndex ?? 0) + 1} ampliada`}
              onClick={() => setZoomed((value) => !value)}
              className={
                zoomed
                  ? "w-[200%] max-w-none cursor-zoom-out"
                  : "max-h-full max-w-full cursor-zoom-in object-contain"
              }
            />
          </div>
        ) : null}
        {total > 1 && viewerIndex != null ? (
          <>
            <button
              type="button"
              onClick={() => {
                setViewerIndex((viewerIndex - 1 + total) % total);
                setZoomed(false);
              }}
              aria-label="Foto anterior"
              className="fixed left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-white"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              type="button"
              onClick={() => {
                setViewerIndex((viewerIndex + 1) % total);
                setZoomed(false);
              }}
              aria-label="Foto siguiente"
              className="fixed right-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-white"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </>
        ) : null}
        <button
          type="button"
          onClick={closeViewer}
          aria-label="Cerrar foto ampliada"
          className="fixed right-3 top-3 grid h-11 w-11 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-white"
        >
          <X className="h-6 w-6" />
        </button>
        {viewerIndex != null ? (
          <span className="pointer-events-none fixed bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white">
            {viewerIndex + 1} / {total} · toca la foto para acercar
          </span>
        ) : null}
      </dialog>
    </div>
  );
}
