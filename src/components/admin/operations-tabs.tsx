"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, Factory, Truck } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin/ordenes", label: "Ordenes", icon: ClipboardList },
  { href: "/admin/produccion", label: "Produccion", icon: Factory },
  { href: "/admin/despachos", label: "Despachos", icon: Truck },
];

export function OperationsTabs() {
  const pathname = usePathname();

  return (
    <div className="inline-flex w-full items-center justify-start gap-1 border-b border-border">
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "-mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
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
  );
}
