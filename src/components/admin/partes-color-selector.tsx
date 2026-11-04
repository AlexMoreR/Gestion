"use client";

import { Loader2, TriangleAlert } from "lucide-react";
import type { CartaMaterial } from "@/lib/carta-colores-crm";
import {
  POR_DEFINIR,
  avisosDeRecargo,
  opcionesDeParte,
  type OpcionDeParte,
  type ParteElegida,
  type ParteParaCotizar,
} from "@/lib/product-parts";

// Selector de color por parte en la cotización (nov-2026): un desplegable por parte, con
// «Por definir» como opción válida. El recargo solo se avisa; nunca cambia el precio.

const aElegida = (parte: string, opcion: OpcionDeParte): ParteElegida =>
  opcion.tipo === "CARTA"
    ? {
        parte,
        color: opcion.color.nombre,
        colorCodigo: opcion.color.codigo,
        colorMaterial: opcion.material,
        colorFotoUrl: opcion.color.fotoUrl,
        hex: opcion.color.hex ?? "",
      }
    : { parte, color: opcion.acabado, colorCodigo: "", colorMaterial: "", colorFotoUrl: "", hex: "" };

const etiqueta = (e: ParteElegida) =>
  e.colorCodigo ? `${e.colorCodigo} · ${e.color}${e.colorMaterial ? ` (${e.colorMaterial})` : ""}` : e.color;

const mismaOpcion = (a: ParteElegida, b: ParteElegida) =>
  a.color === b.color && a.colorCodigo === b.colorCodigo && a.colorMaterial === b.colorMaterial;

/** Lo elegido en orden de las partes; una parte sin elegir queda en Por definir (color vacío). */
export function partesIniciales(partes: ParteParaCotizar[], elegidos: ParteElegida[] = []): ParteElegida[] {
  return partes.map(
    (parte) =>
      elegidos.find((e) => e.parte === parte.nombre) ?? {
        parte: parte.nombre,
        color: "",
        colorCodigo: "",
        colorMaterial: "",
        colorFotoUrl: "",
        hex: "",
      },
  );
}

type Props = {
  partes: ParteParaCotizar[];
  /** null = la carta del CRM todavía está cargando. */
  carta: CartaMaterial[] | null;
  elegidos: ParteElegida[];
  onChange: (next: ParteElegida[]) => void;
  idPrefix: string;
};

export function PartesColorSelector({ partes, carta, elegidos, onChange, idPrefix }: Props) {
  const actuales = partesIniciales(partes, elegidos);
  const avisos = avisosDeRecargo(partes, actuales);

  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        {partes.map((parte, index) => {
          const actual = actuales[index];
          const opciones = opcionesDeParte(parte, carta ?? []).map((opcion) => aElegida(parte.nombre, opcion));
          // Lo ya guardado se conserva aunque la carta haya cambiado.
          if (actual.color && !opciones.some((o) => mismaOpcion(o, actual))) opciones.unshift(actual);
          const valor = actual.color ? String(opciones.findIndex((o) => mismaOpcion(o, actual))) : "";
          const id = `${idPrefix}-parte-${index}`;
          const cargando = parte.tipo === "CARTA" && carta === null;
          return (
            <div key={parte.nombre} className="space-y-1">
              <label htmlFor={id} className="text-xs font-medium text-foreground">
                {parte.nombre}
              </label>
              <div className="flex items-center gap-2">
                {actual.colorFotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={actual.colorFotoUrl} alt="" className="h-8 w-8 shrink-0 rounded border border-border object-cover" />
                ) : (
                  <span
                    className="h-8 w-8 shrink-0 rounded border border-dashed border-border bg-muted"
                    style={actual.hex ? { backgroundColor: actual.hex, borderStyle: "solid" } : undefined}
                  />
                )}
                <select
                  id={id}
                  className="field-select min-w-0 flex-1"
                  value={valor}
                  onChange={(event) => {
                    const i = event.target.value;
                    const next = [...actuales];
                    next[index] = i === "" ? partesIniciales([parte])[0] : opciones[Number(i)];
                    onChange(next);
                  }}
                >
                  <option value="">{POR_DEFINIR}</option>
                  {opciones.map((opcion, i) => (
                    <option key={`${opcion.colorMaterial}-${opcion.colorCodigo}-${opcion.color}`} value={String(i)}>
                      {etiqueta(opcion)}
                    </option>
                  ))}
                </select>
              </div>
              {cargando ? (
                <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Cargando colores del CRM...
                </p>
              ) : parte.tipo === "CARTA" && opciones.length === 0 ? (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  La carta del CRM no tiene colores de {parte.materiales.join(", ")}. Queda en «{POR_DEFINIR}».
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
      {avisos.length > 0 ? (
        <ul className="space-y-1" role="status">
          {avisos.map((aviso) => (
            <li
              key={aviso}
              className="flex items-start gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-400"
            >
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {aviso}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
