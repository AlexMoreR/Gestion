"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import type { NavSection } from "@/lib/sidebar-groups";
import { cn } from "@/lib/utils";

export type NavMainItem = {
  title: string;
  url: string;
  icon?: LucideIcon;
  isActive?: boolean;
};

function ItemSuelto({ item }: { item: NavMainItem }) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton render={<Link href={item.url} />} isActive={item.isActive} tooltip={item.title}>
        {item.icon ? <item.icon /> : null}
        <span>{item.title}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

// Menú lateral: opciones sueltas o grupos que se abren y cierran (la regla está en src/lib/sidebar-groups.ts).
// Los grupos abiertos se recuerdan por usuario en este navegador; el de la página actual siempre se abre.
export function NavMain({ sections, storageKey }: { sections: NavSection<NavMainItem>[]; storageKey: string }) {
  const { state, isMobile } = useSidebar();
  const [abiertos, setAbiertos] = React.useState<Record<string, boolean>>({});

  // Se lee después de montar para que el servidor y el primer render coincidan.
  React.useEffect(() => {
    try {
      const guardado = window.localStorage.getItem(storageKey);
      if (guardado) setAbiertos(JSON.parse(guardado));
    } catch {
      // Sin localStorage solo queda abierto el grupo de la página actual.
    }
  }, [storageKey]);

  const alternar = (titulo: string, abierto: boolean) => {
    const siguiente = { ...abiertos, [titulo]: !abierto };
    setAbiertos(siguiente);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(siguiente));
    } catch {
      // Sin localStorage dura hasta recargar.
    }
  };

  // Barra encogida a íconos (solo computador): todos los íconos sueltos, sin grupos.
  if (state === "collapsed" && !isMobile) {
    return (
      <SidebarGroup>
        <SidebarMenu>
          {sections.flatMap((section) => section.items).map((item) => (
            <ItemSuelto key={item.url} item={item} />
          ))}
        </SidebarMenu>
      </SidebarGroup>
    );
  }

  return (
    <SidebarGroup>
      <SidebarMenu>
        {sections.map((section) => {
          if (!section.title) {
            return section.items.map((item) => <ItemSuelto key={item.url} item={item} />);
          }
          const actual = section.items.some((item) => item.isActive);
          const abierto = actual || Boolean(abiertos[section.title]);
          const Icon = section.icon;
          return (
            <SidebarMenuItem key={section.title}>
              <SidebarMenuButton
                aria-expanded={abierto}
                onClick={() => alternar(section.title!, abierto)}
                tooltip={section.title}
              >
                {Icon ? <Icon /> : null}
                <span>{section.title}</span>
                <ChevronRight
                  className={cn("ml-auto transition-transform duration-200 motion-reduce:transition-none", abierto && "rotate-90")}
                />
              </SidebarMenuButton>
              {abierto ? (
                <SidebarMenuSub>
                  {section.items.map((item) => (
                    <SidebarMenuSubItem key={item.url}>
                      <SidebarMenuSubButton render={<Link href={item.url} />} isActive={item.isActive}>
                        {item.icon ? <item.icon /> : null}
                        <span>{item.title}</span>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  ))}
                </SidebarMenuSub>
              ) : null}
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
