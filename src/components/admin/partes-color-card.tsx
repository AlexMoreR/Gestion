"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Paintbrush, Palette, Plus, Trash2 } from "lucide-react";
import { guardarPartesColorAction, usarPartesDeCategoriaAction } from "@/app/actions/product-parts-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { limpiarLista, type ParteColorTipo, type RecargosParte } from "@/lib/product-parts";

export type ParteColorFila = {
  nombre: string;
  tipo: ParteColorTipo;
  materiales: string[];
  acabados: string[];
  recargos: RecargosParte;
  coloresComunes: string[];
};

// En edición los acabados y los colores comunes se escriben como texto separado por comas, y
// cada recargo como el texto del campo (vacío = sin recargo).
type ParteEditable = {
  nombre: string;
  tipo: ParteColorTipo;
  materiales: string[];
  acabadosTexto: string;
  comunesTexto: string;
  recargoMaterial: Record<string, string>;
  recargoAcabado: Record<string, string>;
};

const aTexto = (tabla: Record<string, number> | undefined) =>
  Object.fromEntries(Object.entries(tabla ?? {}).map(([llave, valor]) => [llave, String(valor)]));

const aEditable = (parte: ParteColorFila): ParteEditable => ({
  nombre: parte.nombre,
  tipo: parte.tipo,
  materiales: parte.materiales,
  acabadosTexto: parte.acabados.join(", "),
  comunesTexto: parte.coloresComunes.join(", "),
  recargoMaterial: aTexto(parte.recargos.materiales),
  recargoAcabado: aTexto(parte.recargos.acabados),
});

/** Solo los recargos escritos con un número mayor a 0, de las opciones que siguen en la lista. */
const aRecargos = (lista: string[], textos: Record<string, string>): Record<string, number> =>
  Object.fromEntries(
    lista.flatMap((opcion) => {
      const valor = Number((textos[opcion] ?? "").replace(/[^0-9]/g, ""));
      return valor > 0 ? [[opcion, valor]] : [];
    }),
  );

const pesos = (valor: number) => `+$${new Intl.NumberFormat("es-CO").format(valor)}`;

function RecargoInput({ value, disabled, label, onChange }: { value: string; disabled: boolean; label: string; onChange: (v: string) => void }) {
  return (
    <Input
      value={value}
      inputMode="numeric"
      placeholder="Recargo $"
      aria-label={label}
      disabled={disabled}
      className="h-8 w-28"
      onChange={(event) => onChange(event.target.value.replace(/[^0-9]/g, ""))}
    />
  );
}

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
  /** Solo producto: enlace a la pantalla de máscaras y cuántas partes ya tienen máscara. */
  mascaras?: { href: string; conMascara: number; total: number };
};

function resumen(parte: ParteColorFila): string {
  const conRecargo = (lista: string[], tabla: Record<string, number> | undefined) =>
    lista.map((opcion) => (tabla?.[opcion] ? `${opcion} (${pesos(tabla[opcion])})` : opcion)).join(", ");
  return parte.tipo === "CARTA"
    ? `Carta: ${conRecargo(parte.materiales, parte.recargos.materiales)}${
        parte.coloresComunes.length > 0 ? ` · Comunes: ${parte.coloresComunes.join(", ")}` : ""
      }`
    : `Acabados: ${conRecargo(parte.acabados, parte.recargos.acabados)}`;
}

// Tarjeta "Partes de color": qué partes del producto llevan color propio y de dónde sale cada uno.
export function PartesColorCard({ duenio, id, partes, partesCategoria = [], categoriaNombre, materialesCarta, mascaras }: Props) {
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
        partes: lista.map((parte) => {
          const acabados = limpiarLista(parte.acabadosTexto.split(","));
          return {
            nombre: parte.nombre,
            tipo: parte.tipo,
            materiales: parte.materiales,
            acabados,
            recargos: {
              materiales: aRecargos(parte.materiales, parte.recargoMaterial),
              acabados: aRecargos(acabados, parte.recargoAcabado),
            },
            coloresComunes: limpiarLista(parte.comunesTexto.split(",")),
          };
        }),
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
        {mascaras ? (
          <Link
            href={mascaras.href}
            className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-[var(--primary)] underline-offset-4 hover:underline"
          >
            <Paintbrush className="h-3.5 w-3.5" />
            Máscaras de color ({mascaras.conMascara} de {mascaras.total})
          </Link>
        ) : null}
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
                      className="field-select"
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
                      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                        {opciones.map((material) => (
                          <div key={material} className="inline-flex items-center gap-2">
                            <label className="inline-flex items-center gap-1.5 text-sm text-slate-700">
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
                            {parte.materiales.includes(material) ? (
                              <RecargoInput
                                value={parte.recargoMaterial[material] ?? ""}
                                disabled={pending}
                                label={`Recargo de ${material}`}
                                onChange={(valor) =>
                                  cambiar(index, { recargoMaterial: { ...parte.recargoMaterial, [material]: valor } })
                                }
                              />
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                    <label className="grid gap-1 pt-1 text-xs font-medium text-slate-700">
                      Colores comunes (salen primero), código o nombre separados por comas
                      <Input
                        value={parte.comunesTexto}
                        placeholder="Ej. Lila, Negro, Beige"
                        disabled={pending}
                        onChange={(event) => cambiar(index, { comunesTexto: event.target.value })}
                      />
                    </label>
                  </fieldset>
                ) : (
                  <div className="space-y-2">
                    <label className="grid gap-1 text-xs font-medium text-slate-700">
                      Acabados, separados por comas
                      <Input
                        value={parte.acabadosTexto}
                        placeholder="Ej. Cromada, Dorada, Negra"
                        disabled={pending}
                        onChange={(event) => cambiar(index, { acabadosTexto: event.target.value })}
                      />
                    </label>
                    {limpiarLista(parte.acabadosTexto.split(",")).length > 0 ? (
                      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                        {limpiarLista(parte.acabadosTexto.split(",")).map((acabado) => (
                          <div key={acabado} className="inline-flex items-center gap-2 text-sm text-slate-700">
                            <span className="break-words">{acabado}</span>
                            <RecargoInput
                              value={parte.recargoAcabado[acabado] ?? ""}
                              disabled={pending}
                              label={`Recargo de ${acabado}`}
                              onChange={(valor) =>
                                cambiar(index, { recargoAcabado: { ...parte.recargoAcabado, [acabado]: valor } })
                              }
                            />
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
          {lista.length > 0 ? (
            <p className="text-xs text-slate-500">
              El «Recargo $» solo sale como aviso en la cotización; no cambia ningún precio. Vacío = sin recargo.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1"
              disabled={pending || lista.length >= MAX_PARTES}
              onClick={() =>
                setLista((actual) => [
                  ...actual,
                  { nombre: "", tipo: "CARTA", materiales: [], acabadosTexto: "", comunesTexto: "", recargoMaterial: {}, recargoAcabado: {} },
                ])
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
