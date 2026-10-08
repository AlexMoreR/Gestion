// ⓘ junto al precio tachado: explica el precio normal y las fechas de la oferta.
// Usa <details> para que funcione con toque en celular y sin JavaScript.
export function PromoPriceInfo({ text, className = "" }: { text: string; className?: string }) {
  return (
    <details className={`group relative inline-block ${className}`}>
      <summary
        className="flex h-5 w-5 cursor-pointer list-none items-center justify-center rounded-full border border-slate-300 text-[11px] font-semibold leading-none text-slate-500 hover:bg-slate-100 [&::-webkit-details-marker]:hidden"
        aria-label="Ver detalle de la oferta"
        title={text}
      >
        i
      </summary>
      <span className="absolute left-1/2 top-6 z-20 w-56 -translate-x-1/2 rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-xs font-normal leading-5 text-slate-600 shadow-lg">
        {text}
      </span>
    </details>
  );
}
