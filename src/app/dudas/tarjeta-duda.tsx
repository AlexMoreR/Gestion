"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, ExternalLink, TriangleAlert } from "lucide-react";

import { guardarRespuestaDudaAction } from "@/app/actions/dudas-actions";
import { formatearFecha, MAX_NOTA, MAX_TEXTO, type OpcionDuda } from "@/modules/dudas/domain/duda";

export type VigenteVista = {
  autorNombre: string;
  fecha: string;
  opcionId: string;
  opcionTexto: string;
  texto: string;
  nota: string;
};

export type TarjetaVista = {
  id: string;
  titulo: string;
  duda: string;
  datos: [string, string][];
  opciones: OpcionDuda[];
  links: { label: string; url: string }[];
  fotos: string[];
  vigente: VigenteVista | null;
};

function esUrl(valor: string) {
  return /^https?:\/\/\S+$/i.test(valor.trim());
}

export function TarjetaDuda({ tarjeta }: { tarjeta: TarjetaVista }) {
  const [vigente, setVigente] = useState<VigenteVista | null>(tarjeta.vigente);
  const [editando, setEditando] = useState(!tarjeta.vigente);
  const [opcionId, setOpcionId] = useState(tarjeta.vigente?.opcionId ?? "");
  const [texto, setTexto] = useState(tarjeta.vigente?.texto ?? "");
  const [nota, setNota] = useState(tarjeta.vigente?.nota ?? "");
  const [error, setError] = useState<string | null>(null);
  const [recienGuardada, setRecienGuardada] = useState(false);
  const [pendiente, startTransition] = useTransition();

  const opcion = tarjeta.opciones.find((o) => o.id === opcionId);

  function guardar() {
    setError(null);
    startTransition(async () => {
      const r = await guardarRespuestaDudaAction({ dudaId: tarjeta.id, opcionId, texto, nota });
      if (!r.ok) {
        setError(r.error);
        if (r.sinSesion) window.location.reload();
        return;
      }
      setVigente(r);
      setEditando(false);
      setRecienGuardada(true);
    });
  }

  return (
    <article id={tarjeta.id} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <header className="space-y-1">
        <h3 className="text-base font-semibold leading-snug text-slate-900">{tarjeta.titulo}</h3>
        {tarjeta.duda ? <p className="text-sm text-slate-600">{tarjeta.duda}</p> : null}
      </header>

      {tarjeta.datos.length ? (
        <dl className="divide-y divide-slate-100 rounded-xl bg-slate-50 px-3 text-sm">
          {tarjeta.datos.map(([etiqueta, valor], i) => (
            <div key={`${etiqueta}-${i}`} className="flex flex-col gap-0.5 py-2 sm:flex-row sm:gap-3">
              <dt className="shrink-0 text-slate-500 sm:w-40">{etiqueta}</dt>
              <dd className="break-words font-medium text-slate-900">
                {esUrl(valor) ? (
                  <a href={valor} target="_blank" rel="noopener noreferrer" className="text-[#42066E] underline">
                    Abrir enlace
                  </a>
                ) : (
                  valor
                )}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {tarjeta.fotos.length ? (
        <div className="grid grid-cols-3 gap-2">
          {tarjeta.fotos.map((url) => (
            <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg bg-slate-100 has-[img[hidden]]:hidden">
              {/* eslint-disable-next-line @next/next/no-img-element -- URLs externas (Drive), sin optimizar */}
              <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.hidden = true; }} className="aspect-square w-full object-cover" />
            </a>
          ))}
        </div>
      ) : null}

      {tarjeta.links.length ? (
        <div className="flex flex-wrap gap-2">
          {tarjeta.links.map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-300 px-3 text-sm font-medium text-[#42066E]"
            >
              <ExternalLink className="h-4 w-4" /> {link.label}
            </a>
          ))}
        </div>
      ) : null}

      {vigente && !editando ? (
        <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">
          <p className="flex items-center gap-2 font-semibold">
            <CheckCircle2 className="h-4 w-4" /> {vigente.opcionTexto}
          </p>
          {vigente.texto ? <p className="whitespace-pre-wrap">{vigente.texto}</p> : null}
          {vigente.nota ? <p className="whitespace-pre-wrap text-emerald-900/80">Nota: {vigente.nota}</p> : null}
          <p className="text-xs text-emerald-900/70">
            {recienGuardada ? "Guardado. " : ""}Respondió {vigente.autorNombre} el {formatearFecha(vigente.fecha)}
          </p>
          <button
            type="button"
            onClick={() => {
              setEditando(true);
              setRecienGuardada(false);
            }}
            className="h-10 rounded-xl border border-emerald-300 bg-white px-4 text-sm font-medium text-emerald-900"
          >
            Cambiar respuesta
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-2" role="radiogroup" aria-label="Respuesta">
            {tarjeta.opciones.map((o) => {
              const elegida = o.id === opcionId;
              return (
                <button
                  key={o.id}
                  type="button"
                  role="radio"
                  aria-checked={elegida}
                  onClick={() => setOpcionId(o.id)}
                  className={`min-h-12 w-full rounded-xl border-2 px-4 py-2 text-left text-base font-medium transition-colors ${
                    elegida ? "border-[#42066E] bg-[#42066E] text-white" : "border-slate-200 bg-white text-slate-900 hover:border-slate-300"
                  }`}
                >
                  {o.label}
                </button>
              );
            })}
          </div>

          {opcion?.texto ? (
            <label className="block space-y-1">
              <span className="text-sm font-medium text-slate-800">Detalle</span>
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                maxLength={MAX_TEXTO}
                rows={3}
                placeholder={opcion.texto}
                className="w-full rounded-xl border border-slate-300 p-3 text-base text-slate-900 outline-none focus:border-[#42066E] focus:ring-2 focus:ring-[#42066E]/20"
              />
            </label>
          ) : null}

          <label className="block space-y-1">
            <span className="text-sm text-slate-600">Nota (opcional)</span>
            <textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              maxLength={MAX_NOTA}
              rows={2}
              placeholder="Algo más que debamos saber"
              className="w-full rounded-xl border border-slate-300 p-3 text-base text-slate-900 outline-none focus:border-[#42066E] focus:ring-2 focus:ring-[#42066E]/20"
            />
          </label>

          {error ? (
            <p role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {error}
            </p>
          ) : null}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={guardar}
              disabled={pendiente || !opcionId}
              className="h-12 flex-1 rounded-xl bg-[#42066E] px-4 text-base font-semibold text-white disabled:opacity-50"
            >
              {pendiente ? "Guardando…" : "Guardar"}
            </button>
            {vigente ? (
              <button
                type="button"
                onClick={() => {
                  setEditando(false);
                  setError(null);
                }}
                className="h-12 rounded-xl border border-slate-300 px-4 text-sm font-medium text-slate-700"
              >
                Cancelar
              </button>
            ) : null}
          </div>
        </div>
      )}
    </article>
  );
}
