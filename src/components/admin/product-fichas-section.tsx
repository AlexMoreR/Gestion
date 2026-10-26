"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, FileText, Plus, Trash2 } from "lucide-react";
import { adminAddFichaAction, adminRemoveFichaAction } from "@/app/actions/product-ficha-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { imageVariantUrl } from "@/lib/image-variants";

export type AdminFicha = {
  id: string;
  src: string; // url para mostrar
  driveUrl: string | null; // enlace a Drive si tiene driveFileId
};

// Seccion "Ficha tecnica" en Editar producto. Las fichas NO son fotos: no entran a la galeria,
// a la portada, a "Traer de Drive" ni a la API de catalogo (NETMAGI).
export function ProductFichasSection({ productId, fichas }: { productId: string; fichas: AdminFicha[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mensaje, setMensaje] = useState<{ ok: boolean; text: string } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <section className="rounded-xl border border-[var(--line)] bg-white p-4" aria-labelledby="ficha-tecnica-admin">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <FileText className="h-4 w-4 text-slate-500" />
        <h2 id="ficha-tecnica-admin" className="text-sm font-semibold text-slate-900">
          Ficha técnica
        </h2>
        <span className="text-xs text-slate-500">
          {fichas.length === 0 ? "Sin fichas" : `${fichas.length} ficha(s)`} · se muestra en la tienda en “Medidas y
          detalles”, nunca como foto
        </span>
      </div>

      {fichas.length > 0 ? (
        <ul className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {fichas.map((ficha) => (
            <li key={ficha.id} className="overflow-hidden rounded-lg border border-[var(--line)] bg-slate-50">
              <a href={ficha.src} target="_blank" rel="noopener noreferrer" title="Abrir grande">
                <img
                  src={imageVariantUrl(ficha.src, "thumb")}
                  alt="Ficha técnica"
                  loading="lazy"
                  className="aspect-[3/4] w-full bg-white object-contain"
                />
              </a>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-1.5 text-xs">
                <a href={ficha.src} target="_blank" rel="noopener noreferrer" className="font-medium text-slate-700 hover:underline">
                  Abrir grande
                </a>
                {ficha.driveUrl ? (
                  <a
                    href={ficha.driveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 font-medium text-emerald-700 hover:underline"
                  >
                    Drive <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null}
                <button
                  type="button"
                  disabled={pending}
                  className="ml-auto inline-flex items-center gap-0.5 font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                  onClick={() => {
                    if (!window.confirm("¿Quitar esta ficha técnica del producto?")) return;
                    startTransition(async () => {
                      const result = await adminRemoveFichaAction({ productId, fichaId: ficha.id });
                      setMensaje({ ok: result.ok, text: result.message });
                      if (result.ok) router.refresh();
                    });
                  }}
                >
                  <Trash2 className="h-3 w-3" /> Quitar
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <form
        ref={formRef}
        className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          formData.set("productId", productId);
          startTransition(async () => {
            const result = await adminAddFichaAction(formData);
            setMensaje({ ok: result.ok, text: result.message });
            if (result.ok && result.estado === "creada") {
              formRef.current?.reset();
              router.refresh();
            }
          });
        }}
      >
        <label className="grid gap-1 text-xs font-medium text-slate-700">
          Imagen de la ficha (JPG, PNG o WEBP)
          <Input name="file" type="file" accept="image/jpeg,image/png,image/webp" required disabled={pending} />
        </label>
        <label className="grid gap-1 text-xs font-medium text-slate-700">
          Enlace o id de Drive (opcional, para no repetirla)
          <Input name="drive" type="text" placeholder="https://drive.google.com/file/d/…" disabled={pending} />
        </label>
        <Button type="submit" size="sm" disabled={pending} className="gap-1.5">
          <Plus className="h-4 w-4" />
          {pending ? "Guardando..." : "Agregar ficha"}
        </Button>
      </form>
      <p className="mt-1.5 text-[11px] text-slate-500">
        Desde Drive: descarga la ficha de “3 EQUIPO DE VENTAS/4-FICHAS TECNICAS” y súbela aquí (Gestión no puede bajarla
        sola). Varias a la vez: <Link href="/admin/productos/fichas" className="underline">carga en lote</Link>.
      </p>
      {mensaje ? (
        <p className={`mt-2 text-xs ${mensaje.ok ? "text-slate-600" : "text-red-600"}`}>{mensaje.text}</p>
      ) : null}
    </section>
  );
}
