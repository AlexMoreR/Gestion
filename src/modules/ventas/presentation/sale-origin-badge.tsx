import { adKeyFromDetail, effectiveOrigin, SALE_ORIGIN_BADGE, SALE_ORIGIN_LABEL } from "../domain/sale-origin";

// Badge corto del origen de la venta/cotizacion ("Meta Ads", "Marketplace", ...). null = "Sin dato"
// (se muestra igual, para que se note lo que falta). Con `detail`, el titulo del anuncio o la cuenta
// MK va en el tooltip.
export function SaleOriginBadge({
  origin,
  detail,
  prefix,
}: {
  origin: string | null | undefined;
  detail?: unknown;
  prefix?: string;
}) {
  const code = effectiveOrigin(origin);
  const ad = adKeyFromDetail(detail);
  const record = detail && typeof detail === "object" && !Array.isArray(detail) ? (detail as Record<string, unknown>) : {};
  const extra = [
    ad?.adTitle ? `Anuncio: ${ad.adTitle}` : ad?.adId ? `Anuncio ${ad.adId}` : null,
    typeof record.mkCuenta === "string" ? `Cuenta ${record.mkCuenta}` : null,
    typeof record.linea === "string" ? `Linea: ${record.linea}` : null,
  ].filter(Boolean);
  const title = [`Origen: ${SALE_ORIGIN_LABEL[code]}`, ...extra].join(" · ");

  return (
    <span
      title={title}
      className={`inline-flex whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${SALE_ORIGIN_BADGE[code]}`}
    >
      {prefix ? `${prefix}${SALE_ORIGIN_LABEL[code]}` : SALE_ORIGIN_LABEL[code]}
    </span>
  );
}
