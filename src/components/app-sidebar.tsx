"use client";

import {
  LayoutDashboard,
  Package,
  Settings,
} from "lucide-react";
import type { Role } from "@prisma/client";
import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import { TeamSwitcher } from "@/components/team-switcher";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar";

const roleHome = {
  ADMIN: "/admin",
  EMPLEADO: "/empleado",
  CLIENTE: "/cliente",
} as const;

type AppSidebarProps = {
  pathname: string;
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
    role?: Role;
  };
};

export function AppSidebar({ pathname, user, ...props }: AppSidebarProps & React.ComponentProps<typeof Sidebar>) {
  const dashboardHref = user.role ? roleHome[user.role] : "/";
  const isAdminConfigRoute = pathname.startsWith("/admin/configuracion");
  const isAdminProductsRoute = pathname.startsWith("/admin/productos");

  const navMain = [
    {
      title: "Dashboard",
      url: dashboardHref,
      icon: LayoutDashboard,
      isActive:
        pathname === dashboardHref ||
        (pathname.startsWith(`${dashboardHref}/`) &&
          !isAdminConfigRoute &&
          !isAdminProductsRoute),
      items: [
        { title: "Vista general", url: dashboardHref },
      ],
    },
  ];

  if (user.role === "ADMIN") {
    navMain.push({
      title: "Configuracion",
      url: "/admin/configuracion",
      icon: Settings,
      isActive: pathname.startsWith("/admin/configuracion"),
      items: [{ title: "Ajustes", url: "/admin/configuracion" }],
    });

    navMain.push({
      title: "Productos",
      url: "/admin/productos",
      icon: Package,
      isActive: pathname.startsWith("/admin/productos"),
      items: [{ title: "Catalogo", url: "/admin/productos" }],
    });
  }

  const teams = [
    { name: "Inovacciones Magi", plan: "Cumpliendo suenos" },
  ];

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher teams={teams} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser
          user={{
            name: user.name ?? "Usuario",
            email: user.email ?? "m@example.com",
            avatar: user.image ?? "",
            role: user.role,
          }}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
