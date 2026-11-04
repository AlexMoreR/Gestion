"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Palette, Plus, Trash2 } from "lucide-react";
import { guardarPartesColorAction, usarPartesDeCategoriaAction } from "@/app/actions/product-parts-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { limpiarLista, type ParteColorTipo } from "@/lib/product-parts";

export type ParteColorFila = {
  nombre: string;
  tipo: ParteColorTipo;
  materiales: string[];
  acabados: string[];
};

// En edición los acabados se escriben como texto separado por comas.
type ParteEditable = { nombre: string; tipo: ParteColorTipo; materiales: string[]; acabadosTexto: string };

const aEditable = (parte: ParteColorFila): ParteEditable => ({
  nombre: parte.nombre,
  tipo: parte.tipo,
  materiales: parte.materiales,
  acabadosTexto: parte.acabados.join(", "),
});

const MAX_PARTES = 10;

type Props = {
  duenio: "categoria" | "producto";
  id: string;
  /** Partes guardadas en esta categoría o producto. */
  partes: ParteColorFila[];
  /** Solo producto: plantilla de su categoría (vacía si no tiene categoría o la categoría no tiene partes). */
  partesCategoria?: ParteColorFila[];
  categoriaNombre?: string | null;
  /** Materiales de la carta de colores del CRM (vacío si no respondió). */
  materialesCarta: string[];
};

function resumen(parte: ParteColorFila): string {
  return parte.tipo === "CARTA" ? `Carta: ${parte.materiales.join(", ")}` : `Acabados: ${parte.acabados.join(", ")}`;
}

// Tarjeta "Partes de color": qué partes del producto llevan color propio y de dónde sale cada uno.
export function PartesColorCard({ duenio, id, partes, partesCategoria = [], categoriaNombre, materialesCarta }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mensaje, setMensaje] = useState<{ ok: boolean; text: string } | null>(null);
  const tienePropias = partes.length > 0;
  const [modo, setModo] = useState<"categoria" | "propias">(duenio === "producto" && !tienePropias ? "categoria" : "propias");
  const [lista, setLista] = useState<ParteEditable[]>(partes.map(aEditable));

  const cambiar = (index: number, cambio: Partial<ParteEditable>) =>
    setLista((actual) => actual.map((parte, i) => (i === index ? { ...parte, ...cambio } : parte)));

  const pasarAPropias = () => {
    setMensaje(null);
    if (!tienePropias) setLista(partesCategoria.map(aEditable));
    setModo("propias");
  };

  const pasarACategoria = () => {
    setMensaje(null);
    if (!tienePropias) {
      setModo("categoria");
      return;
    }
    if (!window.confirm("El producto perderá sus partes propias y usará las de la categoría. ¿Seguir?")) return;
    startTransition(async () => {
      const result = await usarPartesDeCategoriaAction(id);
      setMensaje({ ok: result.ok, text: result.message });
      if (result.ok) {
        setLista([]);
        setModo("categoria");
        router.refresh();
      }
    });
  };

  const guardar = () => {
    setMensaje(null);
    startTransition(async () => {
      const result = await guardarPartesColorAction({
        duenio,
        id,
        partes: lista.map((parte) => ({
          nombre: parte.nombre,
          tipo: parte.tipo,
          materiales: parte.materiales,
          acabados: limpiarLista(parte.acabadosTexto.split(",")),
        })),
      });
      setMensaje({ ok: result.ok, text: result.message });
      if (result.ok) {
        // Un producto que guarda la lista vacía vuelve a usar la plantilla.
        if (duenio === "producto" && lista.length === 0) setModo("categoria");
        router.refresh();
      }
    });
  };

  return (
    <section className="rounded-xl border border-[var(--line)] bg-white p-4" aria-labelledby={`partes-color-${id}`}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Palette className="h-4 w-4 text-slate-500" />
        <h2 id={`partes-color-${id}`} className="text-sm font-semibold text-slate-900">
          Partes de color
        </h2>
        <span className="text-xs text-slate-500">
          {duenio === "categoria"
            ? "Plantilla para los productos de esta categoría"
            : "Qué partes de este producto llevan color propio"}
        </span>
      </div>

      {duenio === "producto" ? (
        <div className="mb-3 flex flex-wrap gap-2" role="radiogroup" aria-label="De dónde salen las partes">
          <Button
            type="button"
            size="sm"
            variant={modo === "categoria" ? "default" : "outline"}
            role="radio"
            aria-checked={modo === "categoria"}
            disabled={pending}
            onClick={() => modo !== "categoria" && pasarACategoria()}
          >
            Usar las de la categoría
          </Button>
          <Button
            type="button"
            size="sm"
            variant={modo === "propias" ? "default" : "outline"}
            role="radio"
            aria-checked={modo === "propias"}
            disabled={pending}
            onClick={() => modo !== "propias" && pasarAPropias()}
          >
            Partes propias
          </Button>
        </div>
      ) : null}

      {modo === "categoria" ? (
        partesCategoria.length > 0 ? (
          <ul className="space-y-1.5 text-sm">
            {partesCategoria.map((parte) => (
              <li key={parte.nombre} className="rounded-lg border border-[var(--line)] bg-slate-50 px-3 py-2">
                <span className="font-medium text-slate-900">{parte.nombre}</span>
                <span className="block text-xs text-slate-600 break-words">{resumen(parte)}</span>
              </li>
            ))}
            <li className="text-xs text-slate-500">
              Vienen de la categoría {categoriaNombre ?? ""}. Para cambiarlas solo aquí, elige «Partes propias».
            </li>
          </ul>
        ) : (
          <p className="text-xs text-slate-500">
            {categoriaNombre
              ? `La categoría ${categoriaNombre} no tiene partes de color. Agrégalas en Categorías o elige «Partes propias».`
              : "El producto no tiene categoría. Elige «Partes propias» para definirlas aquí."}
          </p>
        )
      ) : (
        <div className="space-y-3">
          {lista.length === 0 ? (
            <p className="text-xs text-slate-500">Sin partes. Usa «Agregar parte» (ej. Tapizado, Estructura).</p>
          ) : null}
          {lista.map((parte, index) => {
            // Los materiales ya guardados se ven aunque la carta del CRM no responda.
            const opciones = limpiarLista([...materialesCarta, ...parte.materiales]);
            return (
              <div key={index} className="space-y-2 rounded-lg border border-[var(--line)] p-3">
                <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                  <label className="grid gap-1 text-xs font-medium text-slate-700">
                    Nombre
                    <Input
                      value={parte.nombre}
                      maxLength={40}
                      placeholder="Ej. Tapizado"
                      disabled={pending}
                      onChange={(event) => cambiar(index, { nombre: event.target.value })}
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-medium text-slate-700">
                    Tipo
                    <select
                      value={parte.tipo}
                      disabled={pending}
                      onChange={(event) => cambiar(index, { tipo: event.target.value as ParteColorTipo })}
                      className="h-8 rounded-lg border border-[var(--line)] bg-white px-2 text-sm text-slate-900 outline-none focus:border-[var(--primary)]"
                    >
                      <option value="CARTA">Carta de colores</option>
                      <option value="ACABADOS">Acabados</option>
                    </select>
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    className="gap-1 text-red-600 hover:text-red-700"
                    onClick={() => setLista((actual) => actual.filter((_, i) => i !== index))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Quitar
                  </Button>
                </div>
                {parte.tipo === "CARTA" ? (
                  <fieldset className="space-y-1">
                    <legend className="text-xs font-medium text-slate-700">Materiales de la carta</legend>
                    {opciones.length === 0 ? (
                      <p className="text-xs text-amber-700">
                        La carta de colores del CRM no respondió. Intenta más tarde o usa «Acabados».
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {opciones.map((material) => (
                          <label key={material} className="inline-flex items-center gap-1.5 text-sm text-slate-700">
                            <input
                              type="checkbox"
                              disabled={pending}
                              checked={parte.materiales.includes(material)}
                              onChange={(event) =>
                                cambiar(index, {
                                  materiales: event.target.checked
                                    ? [...parte.materiales, material]
                                    : parte.materiales.filter((m) => m !== material),
                                })
                              }
                            />
                            {material}
                          </label>
                        ))}
                      </div>
                    )}
                  </fieldset>
                ) : (
                  <label className="grid gap-1 text-xs font-medium text-slate-700">
                    Acabados, separados por comas
                    <Input
                      value={parte.acabadosTexto}
                      placeholder="Ej. Cromada, Dorada, Negra"
                      disabled={pending}
                      onChange={(event) => cambiar(index, { acabadosTexto: event.target.value })}
                    />
                  </label>
                )}
              </div>
            );
          })}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1"
              disabled={pending || lista.length >= MAX_PARTES}
              onClick={() =>
                setLista((actual) => [...actual, { nombre: "", tipo: "CARTA", materiales: [], acabadosTexto: "" }])
              }
            >
              <Plus className="h-3.5 w-3.5" />
              Agregar parte
            </Button>
            <Button type="button" size="sm" disabled={pending} onClick={guardar}>
              {pending ? "Guardando..." : "Guardar partes"}
            </Button>
          </div>
        </div>
      )}

      {mensaje ? (
        <p role="status" className={`mt-2 text-xs ${mensaje.ok ? "text-slate-600" : "text-red-600"}`}>
          {mensaje.text}
        </p>
      ) : null}
    </section>
  );
}
