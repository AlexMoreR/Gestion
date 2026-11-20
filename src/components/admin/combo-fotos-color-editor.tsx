"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImageOff, ImagePlus, Plus, Trash2, Upload } from "lucide-react";
import { guardarFotoColorComboAction, quitarFotoColorComboAction } from "@/app/actions/combo-foto-color-actions";
import { PartesColorSelector, partesIniciales } from "@/components/admin/partes-color-selector";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CartaMaterial } from "@/lib/carta-colores-crm";
import type { ParteElegida, ParteParaCotizar } from "@/lib/product-parts";

// Foto por color del combo camilla (nov-2026): una fila por variante de color con su foto.
// Al agregar una variante se eligen los colores como en la cotización (por parte o un solo color).

export type VarianteFoto = { id: string; etiqueta: string; src: string };

type Props = {
  productId: string;
  partes: ParteParaCotizar[];
  carta: CartaMaterial[];
  variantes: VarianteFoto[];
};

const ACEPTA = "image/jpeg,image/png,image/webp";

export function ComboFotosColorEditor({ productId, partes, carta, variantes }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mensaje, setMensaje] = useState<{ ok: boolean; text: string } | null>(null);
  const [agregando, setAgregando] = useState(false);
  const [elegidos, setElegidos] = useState<ParteElegida[]>(() => partesIniciales(partes));
  const [color, setColor] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const fotoNueva = useRef<HTMLInputElement>(null);
  const porPartes = partes.length > 0;
  const coloresCarta = carta.flatMap((material) => material.colores.map((c) => ({ ...c, material: material.nombre })));

  const enviar = (datos: FormData, alTerminar?: () => void) => {
    setMensaje(null);
    startTransition(async () => {
      try {
        const result = await guardarFotoColorComboAction(datos);
        setMensaje({ ok: result.ok, text: result.message });
        if (!result.ok) return;
        alTerminar?.();
        router.refresh();
      } catch {
        setMensaje({ ok: false, text: "No se pudo guardar la foto. Revisa la conexión e intenta de nuevo." });
      }
    });
  };

  const cambiarFoto = (id: string, archivo: File | undefined) => {
    if (!archivo) return;
    const datos = new FormData();
    datos.set("productId", productId);
    datos.set("id", id);
    datos.set("foto", archivo);
    enviar(datos);
  };

  const agregar = () => {
    if (!foto) {
      setMensaje({ ok: false, text: "Elige una foto" });
      return;
    }
    const datos = new FormData();
    datos.set("productId", productId);
    datos.set(
      "colores",
      JSON.stringify(
        porPartes ? { partes: elegidos.map(({ parte, color: c }) => ({ parte, color: c })) } : { color },
      ),
    );
    datos.set("foto", foto);
    enviar(datos, () => {
      setAgregando(false);
      setElegidos(partesIniciales(partes));
      setColor("");
      setFoto(null);
      if (fotoNueva.current) fotoNueva.current.value = "";
    });
  };

  const quitar = (variante: VarianteFoto) => {
    if (!window.confirm(`¿Quitar la foto de «${variante.etiqueta}»?`)) return;
    setMensaje(null);
    startTransition(async () => {
      try {
        const result = await quitarFotoColorComboAction(variante.id);
        setMensaje({ ok: result.ok, text: result.message });
        if (result.ok) router.refresh();
      } catch {
        setMensaje({ ok: false, text: "No se pudo quitar la foto. Revisa la conexión e intenta de nuevo." });
      }
    });
  };

  return (
    <div className="space-y-3 rounded-xl border border-[var(--line)] bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">Variantes de color ({variantes.length})</h2>
        {!agregando ? (
          <Button type="button" size="sm" className="gap-1" disabled={pending} onClick={() => setAgregando(true)}>
            <Plus className="h-3.5 w-3.5" />
            Agregar variante
          </Button>
        ) : null}
      </div>

      {variantes.length === 0 ? (
        <p className="text-sm text-slate-600">Todavía no hay fotos por color. Usa «Agregar variante» para subir la primera.</p>
      ) : (
        <ul className="divide-y divide-[var(--line)]">
          {variantes.map((variante) => (
            <li key={variante.id} className="flex flex-wrap items-center gap-3 py-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={variante.src}
                alt={`Combo en ${variante.etiqueta}`}
                className="h-20 w-20 shrink-0 rounded-md border border-[var(--line)] bg-slate-50 object-contain"
              />
              <p className="min-w-0 flex-1 basis-40 text-sm text-slate-800">{variante.etiqueta}</p>
              <div className="flex flex-wrap gap-2">
                <label
                  className={`${buttonVariants({ size: "sm", variant: "outline" })} cursor-pointer gap-1 focus-within:ring-2 focus-within:ring-ring ${
                    pending ? "pointer-events-none opacity-50" : ""
                  }`}
                >
                  <Upload className="h-3.5 w-3.5" />
                  Cambiar foto
                  <input
                    type="file"
                    accept={ACEPTA}
                    className="sr-only"
                    disabled={pending}
                    onChange={(event) => {
                      cambiarFoto(variante.id, event.target.files?.[0]);
                      event.target.value = "";
                    }}
                  />
                </label>
                <Button type="button" size="sm" variant="outline" className="gap-1" disabled={pending} onClick={() => quitar(variante)}>
                  <Trash2 className="h-3.5 w-3.5" />
                  Quitar
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {agregando ? (
        <div className="space-y-3 rounded-lg border border-[var(--line)] bg-slate-50 p-3">
          <p className="text-sm font-medium text-slate-900">Nueva variante</p>
          {porPartes ? (
            <PartesColorSelector
              idPrefix="foto-color"
              partes={partes}
              carta={carta}
              elegidos={elegidos}
              onChange={setElegidos}
            />
          ) : (
            <div className="space-y-1">
              <label htmlFor="foto-color-unico" className="text-xs font-medium text-foreground">
                Color
              </label>
              <Input
                id="foto-color-unico"
                list="foto-color-carta"
                value={color}
                maxLength={80}
                placeholder="Escribe o elige un color de la carta"
                onChange={(event) => setColor(event.target.value)}
              />
              <datalist id="foto-color-carta">
                {coloresCarta.map((c) => (
                  <option key={`${c.material}-${c.codigo}-${c.nombre}`} value={c.nombre}>
                    {`${c.codigo} · ${c.material}`}
                  </option>
                ))}
              </datalist>
            </div>
          )}
          <div className="space-y-1">
            <label htmlFor="foto-color-archivo" className="text-xs font-medium text-foreground">
              Foto (JPG, PNG o WEBP, máximo 12 MB)
            </label>
            <input
              id="foto-color-archivo"
              ref={fotoNueva}
              type="file"
              accept={ACEPTA}
              className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium"
              onChange={(event) => setFoto(event.target.files?.[0] ?? null)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" className="gap-1" disabled={pending} onClick={agregar}>
              <ImagePlus className="h-3.5 w-3.5" />
              {pending ? "Subiendo..." : "Subir foto"}
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => setAgregando(false)}>
              Cancelar
            </Button>
          </div>
          <p className="text-xs text-slate-500">
            Si ya hay una foto con esos mismos colores, se cambia por la nueva.
          </p>
        </div>
      ) : null}

      {mensaje ? (
        <p role="status" className={`inline-flex items-center gap-1 text-xs ${mensaje.ok ? "text-slate-600" : "text-red-600"}`}>
          {mensaje.ok ? null : <ImageOff className="h-3.5 w-3.5" />}
          {mensaje.text}
        </p>
      ) : null}
    </div>
  );
}
