"use client";

import { useActionState } from "react";
import { KeyRound, TriangleAlert } from "lucide-react";

import { entrarDudasAction, type EstadoEntrar } from "@/app/actions/dudas-actions";

const inicial: EstadoEntrar = { error: null };

export function EntrarForm() {
  const [estado, accion, pendiente] = useActionState(entrarDudasAction, inicial);

  return (
    <form action={accion} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-slate-800">Tu nombre</span>
        <input
          name="nombre"
          required
          minLength={2}
          maxLength={60}
          autoComplete="name"
          placeholder="Ej.: Ingrid"
          className="h-12 w-full rounded-xl border border-slate-300 px-3 text-base text-slate-900 outline-none focus:border-[#42066E] focus:ring-2 focus:ring-[#42066E]/20"
        />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-slate-800">Código</span>
        <input
          name="codigo"
          required
          maxLength={12}
          autoComplete="one-time-code"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="ABC 234"
          className="h-12 w-full rounded-xl border border-slate-300 px-3 text-base uppercase tracking-[0.3em] text-slate-900 outline-none focus:border-[#42066E] focus:ring-2 focus:ring-[#42066E]/20"
        />
        <span className="block text-xs text-slate-500">Son 6 letras y números. Te lo da Emanuel por WhatsApp.</span>
      </label>
      {estado.error ? (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {estado.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pendiente}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#42066E] px-4 text-base font-semibold text-white disabled:opacity-60"
      >
        <KeyRound className="h-5 w-5" /> {pendiente ? "Revisando…" : "Entrar"}
      </button>
    </form>
  );
}
