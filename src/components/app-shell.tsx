"use client";

import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Fragment } from "react";
import type { Role } from "@prisma/client";
import { AppSidebar } from "@/components/app-sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { ModeToggle } from "@/components/mode-toggle";
import { NotificationBell } from "@/components/notification-bell";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import type { AdminModuleKey } from "@/lib/admin-module-access";

type InitialUser = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role?: Role;
};

type AppShellProps = {
  children: React.ReactNode;
  initialUser: InitialUser | null;
  brandName: string;
  adminModuleAccess: Record<AdminModuleKey, boolean>;
};

export function AppShell({ children, initialUser, brandName, adminModuleAccess }: AppShellProps) {
  const { data } = useSession();
  const pathname = usePathname();
  const user = data?.user ?? initialUser;
  const currentPage = pathname === "/"
    ? "Inicio"
    : pathname.startsWith("/admin/cotizaciones")
      ? "Cotizaciones"
      : pathname.startsWith("/admin/categorias")
          ? "Categorias"
          : pathname.startsWith("/admin/proveedores")
            ? "Proveedores"
            : pathname.startsWith("/admin/ventas")
              ? "Ventas"
              : pathname.startsWith("/admin/balances")
                ? "Balances"
              : pathname.startsWith("/admin/configuracion")
                ? "Configuracion"
                : pathname.startsWith("/admin/productos")
                  ? "Productos"
                : pathname.startsWith("/profile")
                  ? "Perfil"
                  : pathname.startsWith("/cliente")
                    ? "Cliente"
                    : pathname.startsWith("/empleado")
                      ? "Empleado"
                      : "Dashboard";

  const breadcrumbItems = (() => {
    if (pathname.startsWith("/admin/configuracion/usuarios")) {
      return [
        { label: "Configuracion", href: "/admin/configuracion", isCurrent: false },
        { label: "Usuarios", href: "", isCurrent: true },
      ];
    }

    if (pathname.startsWith("/admin/configuracion/negocio")) {
      return [
        { label: "Configuracion", href: "/admin/configuracion", isCurrent: false },
        { label: "Configuracion negocio", href: "", isCurrent: true },
      ];
    }

    if (pathname.startsWith("/admin/configuracion/permisos")) {
      return [
        { label: "Configuracion", href: "/admin/configuracion", isCurrent: false },
        { label: "Control de modulos", href: "", isCurrent: true },
      ];
    }

    if (pathname.startsWith("/admin/productos/new")) {
      return [
        { label: "Productos", href: "/admin/productos", isCurrent: false },
        { label: "Nuevo", href: "", isCurrent: true },
      ];
    }

    if (pathname.startsWith("/admin/productos/")) {
      return [
        { label: "Productos", href: "/admin/productos", isCurrent: false },
        { label: "Producto", href: "", isCurrent: true },
      ];
    }

    if (pathname.startsWith("/admin/productos")) {
      return [{ label: "Productos", href: "", isCurrent: true }];
    }

    if (pathname.startsWith("/admin/categorias")) {
      return [{ label: "Categorias", href: "", isCurrent: true }];
    }

    if (pathname.startsWith("/admin/proveedores")) {
      return [{ label: "Proveedores", href: "", isCurrent: true }];
    }

    if (pathname.startsWith("/admin/ventas")) {
      return [{ label: "Ventas", href: "", isCurrent: true }];
    }

    if (pathname.startsWith("/admin/balances")) {
      return [{ label: "Balances", href: "", isCurrent: true }];
    }

    if (pathname.startsWith("/sales")) {
      return [{ label: "Sales", href: "", isCurrent: true }];
    }

    if (pathname.startsWith("/admin/cotizaciones")) {
      return [{ label: "Cotizaciones", href: "", isCurrent: true }];
    }

    return [{ label: currentPage, href: "", isCurrent: true }];
  })();

  if (user) {
    return (
      <SidebarProvider className="admin-print-shell" suppressHydrationWarning>
        <AppSidebar
          pathname={pathname}
          user={{
            name: user.name,
            email: user.email,
            image: user.image,
            role: user.role,
          }}
          brandName={brandName}
          adminModuleAccess={adminModuleAccess}
          className="admin-print-sidebar"
        />
        <SidebarInset className="admin-print-inset">
          <header className="admin-print-header flex h-12 shrink-0 items-center justify-between border-b border-[var(--line)] bg-background">
            <div className="flex items-center gap-2 px-4">
              <SidebarTrigger className="-ml-1" />
              <Separator
                orientation="vertical"
                className="mr-2 h-4"
              />
              <Breadcrumb>
                <BreadcrumbList>
                  {breadcrumbItems.map((item, index) => (
                    <Fragment key={`${item.label}-${index}`}>
                      <BreadcrumbItem>
                        {item.isCurrent ? (
                          <BreadcrumbPage>{item.label}</BreadcrumbPage>
                        ) : (
                          <BreadcrumbLink href={item.href}>{item.label}</BreadcrumbLink>
                        )}
                      </BreadcrumbItem>
                      {index < breadcrumbItems.length - 1 ? <BreadcrumbSeparator /> : null}
                    </Fragment>
                  ))}
                </BreadcrumbList>
              </Breadcrumb>
            </div>
            <div className="flex items-center gap-1 px-4">
              <NotificationBell />
              <ModeToggle />
            </div>
          </header>
          <main className="admin-print-main flex flex-1 flex-col p-3 md:p-4">
            {children}
          </main>
        </SidebarInset>
      </SidebarProvider>
    );
  }

  return (
    <main
      suppressHydrationWarning
      className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-8 md:px-6 md:py-10"
    >
      {children}
    </main>
  );
}
