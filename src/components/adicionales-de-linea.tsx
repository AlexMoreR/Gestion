import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";
import type { AdicionalDeFila } from "@/lib/quote-display-items";

// Adicionales con precio de un producto («Base cromada $50.000») debajo de su nombre, en la cotización y la
// factura de la clienta (también en el PDF). Solo descripción y precio: nunca el costo.
export function AdicionalesDeLinea({
  adicionales,
  currency,
  isPdf = false,
}: {
  adicionales: AdicionalDeFila[];
  currency: SupportedCurrencyCode;
  isPdf?: boolean;
}) {
  if (adicionales.length === 0) return null;
  return (
    <ul className={isPdf ? "mt-0.5 space-y-0.5 text-[10px] text-slate-700" : "mt-1 space-y-0.5 text-xs text-slate-700"}>
      {adicionales.map((adicional, index) => (
        <li key={index}>
          + {adicional.descripcion} {formatMoney(adicional.precio, currency)}
        </li>
      ))}
    </ul>
  );
}
