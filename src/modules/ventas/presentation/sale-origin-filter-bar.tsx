import Link from "next/link";
import { BarChart3 } from "lucide-react";

import { SALE_ORIGIN_LABEL, SALE_ORIGIN_ORDER, type SaleOriginCode } from "../domain/sale-origin";

// Filtro por origen de /admin/ventas: enlaces ?origen=... (se filtra en el servidor, asi la
// URL se puede compartir) y acceso al reporte por origen. Conserva la busqueda ?q= si hay.
export function SaleOriginFilterBar({ active, search }: { active: SaleOriginCode | null; search?: string }) {
  const hrefFor = (origin: SaleOriginCode | null) => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (origin) params.set("origen", origin);
    const query = params.toString();
    return query ? `/admin/ventas?${query}` : "/admin/ventas";
  };

  const chip = (selected: boolean) =>
    `inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
      selected
        ? "border-primary bg-primary text-primary-foreground"
        : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
    }`;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <nav aria-label="Filtrar por origen" className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-muted-foreground">Origen:</span>
        <Link href={hrefFor(null)} className={chip(active === null)}>
          Todos
        </Link>
        {SALE_ORIGIN_ORDER.map((origin) => (
          <Link key={origin} href={hrefFor(origin)} className={chip(active === origin)}>
            {SALE_ORIGIN_LABEL[origin]}
          </Link>
        ))}
      </nav>
      <Link
        href="/admin/ventas/origen"
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
      >
        <BarChart3 className="h-3.5 w-3.5" />
        Reporte por origen
      </Link>
    </div>
  );
}
