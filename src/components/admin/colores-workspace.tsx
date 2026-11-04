"use client";

import Image from "next/image";
import { useState } from "react";
import { Eye, EyeOff, Pencil, Plus, X } from "lucide-react";
import {
  crearColorAction,
  editarColorAction,
  ocultarColorAction,
  ocultarMaterialAction,
} from "@/app/actions/colores-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ColorRow = {
  id: string;
  codigo: string;
  nombre: string;
  hex: string | null;
  fotoUrl: string | null;
  oculto: boolean;
  etiqueta: string;
};

type MaterialRow = {
  id: string;
  nombre: string;
  oculto: boolean;
  colores: ColorRow[];
};

type Modal = { modo: "nuevo" } | { modo: "editar"; materialId: string; color: ColorRow };

const SELECT_CLASS =
  "h-9 w-full rounded-lg border border-[var(--line)] bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-[var(--primary)]";

function Muestra({ color }: { color: ColorRow }) {
  return (
    <div className="relative aspect-square w-full border-b border-[var(--line)]" style={{ backgroundColor: color.hex ?? "#e2e8f0" }}>
      {color.fotoUrl ? (
        <Image src={color.fotoUrl} alt={color.etiqueta} fill className="object-cover" unoptimized />
      ) : null}
    </div>
  );
}

export function ColoresWorkspace({ materiales }: { materiales: MaterialRow[] }) {
  const [modal, setModal] = useState<Modal | null>(null);
  const editando = modal?.modo === "editar" ? modal : null;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-xs text-slate-600">
          Colores de cueros y telas que ve la clienta en magilus.com/colores. Nada se borra: lo que no sirve se oculta.
        </p>
        <Button type="button" onClick={() => setModal({ modo: "nuevo" })}>
          <Plus className="h-4 w-4" />
          Agregar color
        </Button>
      </div>

      {materiales.map((material) => (
        <section key={material.id} className="saas-card space-y-3 rounded-xl p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-slate-900">{material.nombre}</h2>
              {material.oculto ? <Badge variant="destructive">Oculto</Badge> : null}
            </div>
            <form action={ocultarMaterialAction}>
              <input type="hidden" name="materialId" value={material.id} />
              <input type="hidden" name="oculto" value={material.oculto ? "0" : "1"} />
              <Button type="submit" variant="outline" size="sm">
                {material.oculto ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                {material.oculto ? "Mostrar material" : "Ocultar material"}
              </Button>
            </form>
          </div>

          {material.colores.length === 0 ? (
            <p className="text-sm text-slate-500">Aún no hay colores cargados en este material</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {material.colores.map((color) => (
                <article
                  key={color.id}
                  className={`overflow-hidden rounded-lg border border-[var(--line)] bg-white ${color.oculto ? "opacity-60" : ""}`}
                >
                  <Muestra color={color} />
                  <div className="space-y-2 p-2.5">
                    <p className="text-sm font-medium break-words text-slate-900">{color.etiqueta}</p>
                    <Badge variant={color.oculto ? "destructive" : "secondary"}>{color.oculto ? "Oculto" : "Visible"}</Badge>
                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setModal({ modo: "editar", materialId: material.id, color })}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Editar
                      </Button>
                      <form action={ocultarColorAction}>
                        <input type="hidden" name="colorId" value={color.id} />
                        <input type="hidden" name="oculto" value={color.oculto ? "0" : "1"} />
                        <Button type="submit" variant="outline" size="sm">
                          {color.oculto ? "Mostrar" : "Ocultar"}
                        </Button>
                      </form>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ))}

      {modal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#11182752] px-4"
          role="dialog"
          aria-modal="true"
          aria-label={editando ? "Editar color" : "Agregar color"}
          onClick={() => setModal(null)}
        >
          <div
            className="saas-card max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">{editando ? "Editar color" : "Agregar color"}</h2>
              <Button type="button" variant="outline" size="icon" onClick={() => setModal(null)} className="h-8 w-8" aria-label="Cerrar">
                <X className="h-4 w-4" />
              </Button>
            </div>

            <form
              key={editando?.color.id ?? "nuevo"}
              action={editando ? editarColorAction : crearColorAction}
              className="space-y-3"
            >
              {editando ? <input type="hidden" name="colorId" value={editando.color.id} /> : null}
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-700">Material</span>
                <select name="materialId" required defaultValue={editando?.materialId ?? ""} className={SELECT_CLASS}>
                  <option value="" disabled>
                    Elige el material
                  </option>
                  {materiales.map((material) => (
                    <option key={material.id} value={material.id}>
                      {material.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-700">Código</span>
                <Input name="codigo" required maxLength={10} defaultValue={editando?.color.codigo ?? ""} placeholder="Ej. 03" />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-700">Nombre</span>
                <Input
                  name="nombre"
                  required
                  minLength={2}
                  maxLength={60}
                  defaultValue={editando?.color.nombre ?? ""}
                  placeholder="Ej. Palo rosa"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-700">Color</span>
                <input
                  name="hex"
                  type="color"
                  defaultValue={editando?.color.hex ?? "#000000"}
                  className="h-10 w-20 cursor-pointer rounded-lg border border-[var(--line)] bg-white p-1"
                />
                <span className="block text-xs text-slate-500">Se ve cuando el color no tiene foto.</span>
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-700">Foto (opcional)</span>
                <Input name="foto" type="file" accept="image/jpeg,image/png,image/webp" />
                <span className="block text-xs text-slate-500">
                  JPG, PNG o WEBP, máximo 12 MB.
                  {editando?.color.fotoUrl ? " Si no eliges otra, se deja la foto actual." : ""}
                </span>
              </label>
              <Button type="submit" className="w-full">
                {editando ? "Guardar cambios" : "Guardar color"}
              </Button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
