"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Camera, TriangleAlert } from "lucide-react";
import { submitExpenseReceiptAction } from "@/app/actions/expense-draft-actions";

type Props = { token: string };

export function SoporteForm({ token }: Props) {
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<{ reason: string; canRetry: boolean } | null>(null);

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await submitExpenseReceiptAction(token, formData);
      if (result.ok) {
        setSaved(result.summary);
      } else {
        setError({ reason: result.reason, canRetry: result.canRetry });
      }
    });
  }

  if (saved) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
        <p className="flex items-center gap-2 font-semibold">
          <CheckCircle2 className="h-5 w-5" /> Gasto guardado
        </p>
        <p className="mt-1 text-sm">{saved}</p>
        <p className="mt-2 text-sm">Ya puedes cerrar esta página.</p>
      </div>
    );
  }

  if (error && !error.canRetry) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">
        <p className="flex items-center gap-2 font-semibold">
          <TriangleAlert className="h-5 w-5" /> No se guardó el gasto
        </p>
        <p className="mt-1 text-sm">{error.reason}</p>
      </div>
    );
  }

  return (
    <form action={onSubmit} className="space-y-3">
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-white p-6 text-center text-slate-700">
        <Camera className="h-8 w-8" />
        <span className="text-sm font-medium">Toma la foto del soporte o elígela de la galería</span>
        <input type="file" name="receipt" accept="image/*,application/pdf" capture="environment" required className="w-full text-xs" />
      </label>
      {error ? (
        <p className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {error.reason}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-[#42066E] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Revisando la foto…" : "Enviar foto"}
      </button>
    </form>
  );
}
