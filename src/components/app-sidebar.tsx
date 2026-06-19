"use client";

import {
  BadgeDollarSign,
  ClipboardList,
  FileText,
  Landmark,
  LayoutDashboard,
  Package,
  Settings,
  Tag,
  Truck,
} from "lucide-react";
import type { Role } from "@prisma/client";
import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import { TeamSwitcher } from "@/components/team-switcher";
import type { AdminModuleKey } from "@/lib/admin-module-access";
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
  brandName: string;
  adminModuleAccess: Record<AdminModuleKey, boolean>;
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
    role?: Role;
  };
};

export function AppSidebar({ pathname, brandName, adminModuleAccess, user, ...props }: AppSidebarProps & React.ComponentProps<typeof Sidebar>) {
  const dashboardHref = user.role ? roleHome[user.role] : "/";
  const isAdminConfigRoute = pathname.startsWith("/admin/configuracion");
  const isAdminCategoriesRoute = pathname.startsWith("/admin/categorias");
  const isAdminProductsRoute = pathname.startsWith("/admin/productos");
  const isAdminQuotesRoute = pathname.startsWith("/admin/cotizaciones");
  const isAdminSalesRoute = pathname.startsWith("/admin/ventas");
  const isAdminBalancesRoute = pathname.startsWith("/admin/balances");
  const isAdminOrdersRoute = pathname.startsWith("/admin/ordenes");
  const isAdminProductionRoute = pathname.startsWith("/admin/produccion");
  const isAdminDispatchesRoute = pathname.startsWith("/admin/despachos");
  const isAdminSuppliersRoute = pathname.startsWith("/admin/proveedores");

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
          !isAdminProductsRoute &&
        !isAdminQuotesRoute &&
        !isAdminSalesRoute &&
        !isAdminBalancesRoute &&
        !isAdminOrdersRoute &&
        !isAdminProductionRoute &&
        !isAdminDispatchesRoute &&
        !isAdminSuppliersRoute),
      items: [
        { title: "Vista general", url: dashboardHref },
      ],
    },
  ];

  if (user.role === "ADMIN") {
    const canSeeConfig =
      adminModuleAccess.config_users ||
      adminModuleAccess.config_business ||
      adminModuleAccess.config_permissions;

    if (canSeeConfig) {
      navMain.push({
        title: "Configuracion",
        url: "/admin/configuracion",
        icon: Settings,
        isActive: pathname.startsWith("/admin/configuracion"),
        items: [{ title: "Ajustes", url: "/admin/configuracion" }],
      });
    }

    if (adminModuleAccess.products) {
      navMain.push({
        title: "Productos",
        url: "/admin/productos",
        icon: Package,
        isActive: pathname.startsWith("/admin/productos"),
        items: [{ title: "Catalogo", url: "/admin/productos" }],
      });
    }

    if (adminModuleAccess.categories) {
      navMain.push({
        title: "Categorias",
        url: "/admin/categorias",
        icon: Tag,
        isActive: pathname.startsWith("/admin/categorias"),
        items: [{ title: "Gestion", url: "/admin/categorias" }],
      });
    }

    if (adminModuleAccess.suppliers) {
      navMain.push({
        title: "Proveedores",
        url: "/admin/proveedores",
        icon: Truck,
        isActive: pathname.startsWith("/admin/proveedores"),
        items: [{ title: "Gestion", url: "/admin/proveedores" }],
      });
    }

    if (adminModuleAccess.quotes) {
      navMain.push({
        title: "Cotizaciones",
        url: "/admin/cotizaciones",
        icon: FileText,
        isActive: pathname.startsWith("/admin/cotizaciones"),
        items: [{ title: "Listado", url: "/admin/cotizaciones" }],
      });
    }

    if (adminModuleAccess.sales) {
      navMain.push({
        title: "Ventas",
        url: "/admin/ventas",
        icon: BadgeDollarSign,
        isActive: pathname.startsWith("/admin/ventas"),
        items: [{ title: "Listado", url: "/admin/ventas" }],
      });
    }

    if (adminModuleAccess.balances) {
      navMain.push({
        title: "Balances",
        url: "/admin/balances",
        icon: Landmark,
        isActive: pathname.startsWith("/admin/balances"),
        items: [{ title: "Rentabilidad", url: "/admin/balances" }],
      });
    }

    const operationsItems: { title: string; url: string }[] = [];
    if (adminModuleAccess.orders) {
      operationsItems.push({ title: "Listado", url: "/admin/ordenes" });
    }
    if (adminModuleAccess.production) {
      operationsItems.push({ title: "Produccion", url: "/admin/produccion" });
    }
    if (adminModuleAccess.dispatches) {
      operationsItems.push({ title: "Despachos", url: "/admin/despachos" });
    }

    if (operationsItems.length > 0) {
      navMain.push({
        title: "Ordenes",
        url: operationsItems[0].url,
        icon: ClipboardList,
        isActive: isAdminOrdersRoute || isAdminProductionRoute || isAdminDispatchesRoute,
        items: operationsItems,
      });
    }
  }

  const teams = [
    { name: brandName, plan: "Cumpliendo suenos" },
  ];

  const canAccessConfig =
    adminModuleAccess.config_users ||
    adminModuleAccess.config_business ||
    adminModuleAccess.config_permissions;

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="p-1.5">
        <TeamSwitcher teams={teams} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} />
      </SidebarContent>
      <SidebarFooter className="p-1.5">
        <NavUser
          user={{
            name: user.name ?? "Usuario",
            email: user.email ?? "m@example.com",
            avatar: user.image ?? "",
            role: user.role,
          }}
          canAccessConfig={canAccessConfig}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
