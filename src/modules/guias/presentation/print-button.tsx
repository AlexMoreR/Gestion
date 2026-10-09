"use client";

import { Printer } from "lucide-react";

// Abre el dialogo de impresion del navegador (ahi mismo se elige "Guardar como PDF").
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#42066E] px-5 text-base font-semibold text-white sm:w-auto"
    >
      <Printer className="h-5 w-5" aria-hidden /> Imprimir / Guardar PDF
    </button>
  );
}
