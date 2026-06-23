"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin/configuracion/negocio", label: "Negocio", icon: Settings },
  { href: "/admin/configuracion/usuarios", label: "Empleados", icon: Users },
];

export function ConfigTabs({ action }: { action?: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex w-full items-center justify-between gap-1 border-b border-border">
      <div className="inline-flex items-center justify-start gap-1">
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
      {action ? <div className="pb-1">{action}</div> : null}
    </div>
  );
}
