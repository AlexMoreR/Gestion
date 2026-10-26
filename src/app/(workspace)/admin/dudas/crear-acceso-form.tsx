"use client";

import { useActionState, useState } from "react";
import { Copy, KeyRound } from "lucide-react";

import { crearAccesoDudasAction, type EstadoCrearAcceso } from "@/app/actions/dudas-actions";

const inicial: EstadoCrearAcceso = { error: null };

export function CrearAccesoForm({ urlDudas }: { urlDudas: string }) {
  const [estado, accion, pendiente] = useActionState(crearAccesoDudasAction, inicial);
  const [copiado, setCopiado] = useState<string | null>(null);

  const mensaje = estado.codigo
    ? `Hola ${estado.nombre}. Entra a ${urlDudas} con tu nombre y este código: ${estado.codigo}`
    : "";

  async function copiar(texto: string, cual: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(cual);
    } catch {
      setCopiado(null);
    }
  }

  return (
    <div className="space-y-3">
      <form action={accion} className="flex flex-wrap items-end gap-2">
        <label className="space-y-1">
          <span className="block text-xs text-muted-foreground">Nombre de la persona</span>
          <input
            name="nombre"
            required
            minLength={2}
            maxLength={60}
            placeholder="Ej.: Ingrid"
            className="h-9 w-56 rounded-md border border-border bg-card px-2 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={pendiente}
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          <KeyRound className="h-4 w-4" /> {pendiente ? "Creando…" : "Crear código"}
        </button>
      </form>
      {estado.error ? <p className="text-sm text-destructive">{estado.error}</p> : null}
      {estado.codigo ? (
        <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
          <p>
            Código para <strong>{estado.nombre}</strong>. <strong>Solo se muestra esta vez</strong>: cópialo y mándalo por WhatsApp.
          </p>
          <p className="font-mono text-2xl font-semibold tracking-[0.3em]">{estado.codigo}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => copiar(estado.codigo ?? "", "codigo")}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-amber-400 bg-white px-3 text-xs font-medium text-amber-950"
            >
              <Copy className="h-3.5 w-3.5" /> {copiado === "codigo" ? "Copiado" : "Copiar código"}
            </button>
            <button
              type="button"
              onClick={() => copiar(mensaje, "mensaje")}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-amber-400 bg-white px-3 text-xs font-medium text-amber-950"
            >
              <Copy className="h-3.5 w-3.5" /> {copiado === "mensaje" ? "Copiado" : "Copiar mensaje para WhatsApp"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
