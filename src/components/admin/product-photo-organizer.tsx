"use client";

import { useMemo, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, GripVertical, Images, Star, Trash2 } from "lucide-react";
import { adminSaveProductGalleryAction } from "@/app/actions/product-gallery-actions";
import { Button } from "@/components/ui/button";
import {
  findCoverId,
  formatBytes,
  imageSource,
  moveItem,
  moveToFront,
  removeId,
  SOURCE_LABEL,
  type OrganizerSource,
} from "@/lib/gallery-organizer";

export type OrganizerPhoto = {
  id: string;
  url: string; // url original en la base
  src: string; // url para mostrar
  order: number;
  origen: string | null;
  driveFileId: string | null;
  bytes: number | null;
};

const SOURCE_STYLE: Record<OrganizerSource, string> = {
  drive: "bg-emerald-100 text-emerald-800",
  servidor: "bg-slate-200 text-slate-700",
  enlace: "bg-amber-100 text-amber-800",
};

// Organizador de fotos en Editar producto: reordenar (arrastrar o subir/bajar), elegir portada,
// quitar (con confirmacion en la pagina) y guardar con una sola accion de servidor.
export function ProductPhotoOrganizer({
  productId,
  thumbnailUrl,
  photos,
}: {
  productId: string;
  thumbnailUrl: string;
  photos: OrganizerPhoto[];
}) {
  const byId = useMemo(() => new Map(photos.map((photo) => [photo.id, photo])), [photos]);
  const initialCover = useMemo(() => findCoverId(photos, thumbnailUrl), [photos, thumbnailUrl]);
  const initialOrder = useMemo(() => {
    const ids = [...photos].sort((a, b) => a.order - b.order).map((photo) => photo.id);
    return initialCover ? moveToFront(ids, initialCover) : ids;
  }, [photos, initialCover]);

  const [order, setOrder] = useState<string[]>(initialOrder);
  const [removed, setRemoved] = useState<string[]>([]);
  const [coverId, setCoverId] = useState<string | null>(initialCover);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [dims, setDims] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  // Portada efectiva (al quitar la portada, remove() ya pasa la portada a la primera que queda).
  const effectiveCover = coverId && order.includes(coverId) ? coverId : null;
  const dirty = removed.length > 0 || order.join() !== initialOrder.join() || effectiveCover !== initialCover;

  const move = (from: number, to: number) => {
    // La portada siempre va primera: no se puede mover nada por encima de ella.
    const floor = effectiveCover && order[0] === effectiveCover ? 1 : 0;
    if (from < floor || to < floor) return;
    setOrder((current) => moveItem(current, from, to));
    setStatus(null);
  };

  const makeCover = (id: string) => {
    setCoverId(id);
    setOrder((current) => moveToFront(current, id));
    setStatus(null);
  };

  const remove = (id: string) => {
    const next = removeId(order, id);
    if (next.length === 0) {
      setStatus({ ok: false, message: "El producto debe quedar con al menos una foto" });
      setConfirmId(null);
      return;
    }
    setOrder(next);
    setRemoved((current) => [...current, id]);
    if (effectiveCover === id) setCoverId(next[0]);
    setConfirmId(null);
    setStatus(null);
  };

  const reset = () => {
    setOrder(initialOrder);
    setRemoved([]);
    setCoverId(initialCover);
    setConfirmId(null);
    setStatus(null);
  };

  const save = () => {
    startTransition(async () => {
      const result = await adminSaveProductGalleryAction({
        productId,
        order,
        removeIds: removed,
        coverId: effectiveCover,
      });
      setStatus(result);
      if (result.ok && result.message !== "No habia cambios") {
        // Igual que "Traer de Drive": recarga para que el formulario de abajo vea las fotos nuevas.
        window.location.reload();
      }
    });
  };

  return (
    <section className="rounded-xl border border-[var(--line)] bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900">
          <Images className="h-4 w-4 text-slate-500" />
          Fotos ({order.length})
        </h2>
        <p className="text-xs text-slate-500">
          Arrastra o usa las flechas para ordenar. La portada siempre va primera.
        </p>
      </div>

      {!initialCover && thumbnailUrl ? (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          La portada actual no esta en la galeria. Marca una foto como portada para reemplazarla.
        </p>
      ) : null}

      <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {order.map((id, index) => {
          const photo = byId.get(id);
          if (!photo) return null;
          const source = imageSource(photo);
          const isCover = effectiveCover === id;
          const locked = isCover && index === 0;
          const floor = effectiveCover && order[0] === effectiveCover ? 1 : 0;
          return (
            <li
              key={id}
              draggable={!locked && !pending}
              onDragStart={(e) => {
                setDragIndex(index);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                if (dragIndex === null) return;
                e.preventDefault();
                setOverIndex(index);
              }}
              onDragLeave={() => setOverIndex((current) => (current === index ? null : current))}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIndex !== null) move(dragIndex, index);
                setDragIndex(null);
                setOverIndex(null);
              }}
              onDragEnd={() => {
                setDragIndex(null);
                setOverIndex(null);
              }}
              className={`relative flex flex-col overflow-hidden rounded-lg border bg-slate-50 transition ${
                isCover ? "border-[var(--primary)] ring-2 ring-[var(--primary)]/30" : "border-[var(--line)]"
              } ${overIndex === index && dragIndex !== index ? "outline-2 outline-dashed outline-[var(--primary)]" : ""} ${
                dragIndex === index ? "opacity-50" : ""
              }`}
              aria-label={`Foto ${index + 1}${isCover ? ", portada" : ""}`}
            >
              <div className="relative aspect-square bg-slate-100">
                <img
                  src={photo.src}
                  alt={`Foto ${index + 1}`}
                  className="h-full w-full object-cover"
                  draggable={false}
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    if (img.naturalWidth > 0) {
                      setDims((current) => ({ ...current, [id]: `${img.naturalWidth}×${img.naturalHeight}` }));
                    }
                  }}
                />
                <span className="absolute left-1.5 top-1.5 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-black/70 px-1.5 text-xs font-bold text-white">
                  {index + 1}
                </span>
                {isCover ? (
                  <span className="absolute right-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-[var(--primary)] px-2 py-0.5 text-[11px] font-semibold text-white">
                    <Star className="h-3 w-3" /> Portada
                  </span>
                ) : (
                  <GripVertical className="absolute right-1.5 top-1.5 h-5 w-5 rounded bg-white/80 text-slate-500" aria-hidden />
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1 px-2 pt-1.5 text-[11px] text-slate-600">
                <span className={`rounded px-1.5 py-0.5 font-semibold ${SOURCE_STYLE[source]}`}>{SOURCE_LABEL[source]}</span>
                <span>{formatBytes(photo.bytes)}</span>
                {dims[id] ? <span className="text-slate-400">· {dims[id]}</span> : null}
              </div>

              {confirmId === id ? (
                <div className="m-2 space-y-1.5 rounded-md bg-red-50 p-2 text-xs text-red-800">
                  <p>¿Quitar esta foto del producto?</p>
                  <div className="flex gap-1.5">
                    <Button type="button" size="sm" variant="destructive" className="h-7 px-2" onClick={() => remove(id)}>
                      Si, quitar
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="h-7 px-2" onClick={() => setConfirmId(null)}>
                      No
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-1 p-2">
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="h-7 w-7"
                    disabled={pending || index <= floor}
                    onClick={() => move(index, index - 1)}
                    aria-label={`Subir foto ${index + 1}`}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="h-7 w-7"
                    disabled={pending || locked || index >= order.length - 1}
                    onClick={() => move(index, index + 1)}
                    aria-label={`Bajar foto ${index + 1}`}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  {!isCover ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-[11px]"
                      disabled={pending}
                      onClick={() => makeCover(id)}
                      aria-label={`Marcar foto ${index + 1} como portada`}
                    >
                      <Star className="h-3 w-3" /> Portada
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="ml-auto h-7 w-7 text-red-600 hover:text-red-700"
                    disabled={pending || order.length <= 1}
                    onClick={() => setConfirmId(id)}
                    aria-label={`Quitar foto ${index + 1}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {order.length === 0 ? <p className="text-sm text-slate-500">Este producto no tiene fotos en la galeria.</p> : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button type="button" disabled={!dirty || pending} onClick={save}>
          {pending ? "Guardando..." : "Guardar fotos"}
        </Button>
        <Button type="button" variant="outline" disabled={!dirty || pending} onClick={reset}>
          Deshacer cambios
        </Button>
        {dirty ? (
          <span className="text-xs text-slate-500">
            Al guardar la pagina se recarga: guarda antes los otros cambios del producto.
          </span>
        ) : null}
        {status ? (
          <span className={`text-xs font-medium ${status.ok ? "text-emerald-700" : "text-red-600"}`} role="status">
            {status.message}
          </span>
        ) : null}
      </div>
    </section>
  );
}
