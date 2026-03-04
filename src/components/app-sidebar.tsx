"use client";

import {
  LayoutDashboard,
  Package,
  Settings,
  Tag,
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
  const isAdminCategoriesRoute = pathname.startsWith("/admin/categorias");
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
          !isAdminCategoriesRoute &&
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

    navMain.push({
      title: "Categorias",
      url: "/admin/categorias",
      icon: Tag,
      isActive: pathname.startsWith("/admin/categorias"),
      items: [{ title: "Gestion", url: "/admin/categorias" }],
    });
  }

  const teams = [
    { name: "Innovaciones Magi", plan: "Cumpliendo suenos" },
  ];

  return (
    <Sidebar collapsible="icon" {...props}>

        <TeamSwitcher teams={teams} />

      <SidebarContent>
        <NavMain items={navMain} />
      </SidebarContent>
      <SidebarFooter className="border-t-0 !p-0">
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
