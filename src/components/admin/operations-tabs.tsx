"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, Factory, PackageSearch, PhoneCall, Truck } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin/ordenes", label: "Ordenes", icon: ClipboardList },
  { href: "/admin/produccion", label: "Produccion", icon: Factory },
  { href: "/admin/despachos", label: "Despachos", icon: Truck },
  { href: "/admin/despachos/transportadora", label: "Transportadora", icon: PhoneCall },
  { href: "/admin/despachos/guias", label: "Guías", icon: PackageSearch },
];

export function OperationsTabs() {
  const pathname = usePathname();
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef<HTMLAnchorElement | null>(null);

  // En celular la barra se desplaza horizontalmente: dejar visible la pestaña activa
  // (equivale a scrollIntoView inline "nearest", pero solo mueve la barra, no la pagina).
  useEffect(() => {
    const scroller = scrollerRef.current;
    const tab = activeRef.current;
    if (!scroller || !tab) return;
    // La barra es `relative`, asi que offsetLeft de la pestaña ya es relativo a ella.
    const left = tab.offsetLeft;
    const right = left + tab.offsetWidth;
    if (left < scroller.scrollLeft) {
      scroller.scrollLeft = left;
    } else if (right > scroller.scrollLeft + scroller.clientWidth) {
      scroller.scrollLeft = right - scroller.clientWidth;
    }
  }, [pathname]);

  return (
    // w-0 min-w-full: la barra nunca aporta ancho propio al layout (no estira la pagina en celular);
    // el sobrante se desplaza dentro de la barra.
    <div
      ref={scrollerRef}
      className="relative w-0 min-w-full max-w-full overflow-x-auto overscroll-x-contain border-b border-border [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div className="flex w-max flex-nowrap items-center gap-1">
        {TABS.map(({ href, label, icon: Icon }) => {
          // La pestaña mas especifica gana: /admin/despachos/transportadora no marca tambien Despachos.
          const active =
            pathname.startsWith(href) &&
            !TABS.some((other) => other.href !== href && other.href.startsWith(href) && pathname.startsWith(other.href));
          return (
            <Link
              key={href}
              href={href}
              ref={active ? activeRef : undefined}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-2.5 py-2 text-sm font-medium transition-colors sm:gap-2 sm:px-3",
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
