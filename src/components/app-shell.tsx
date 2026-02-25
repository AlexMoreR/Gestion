"use client";

import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
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
import { Navbar } from "@/components/navbar";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

type InitialUser = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role?: Role;
};

type AppShellProps = {
  children: React.ReactNode;
  initialUser: InitialUser | null;
};

export function AppShell({ children, initialUser }: AppShellProps) {
  const { data } = useSession();
  const pathname = usePathname();
  const user = data?.user ?? initialUser;
  const currentPage = pathname === "/"
    ? "Inicio"
    : pathname.startsWith("/admin/configuracion")
      ? "Configuracion"
      : pathname.startsWith("/admin/productos")
        ? "Productos"
      : pathname.startsWith("/profile")
        ? "Perfil"
        : "Dashboard";

  if (user) {
    return (
      <SidebarProvider>
        <div className="flex min-h-screen">
          <AppSidebar
            pathname={pathname}
            user={{
              name: user.name,
              email: user.email,
              image: user.image,
              role: user.role,
            }}
            className="flex"
          />
          <SidebarInset>
            <header className="flex h-12 shrink-0 items-center border-b border-[var(--line)] bg-white">
              <div className="flex items-center gap-2 px-4">
                <SidebarTrigger className="-ml-1" />
                <Separator
                  orientation="vertical"
                  className="mr-2 h-4"
                />
                <Breadcrumb>
                  <BreadcrumbList>
                    <BreadcrumbItem className="hidden md:block">
                      <BreadcrumbLink href="#">
                        Administrador
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator className="hidden md:block" />
                    <BreadcrumbItem>
                      <BreadcrumbPage>{currentPage}</BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
              </div>
            </header>
            <main className="flex flex-1 flex-col p-3 md:p-4">
              {children}
            </main>
          </SidebarInset>
        </div>
      </SidebarProvider>
    );
  }

  const showTopMenu = pathname === "/";

  return (
    <>
      {showTopMenu ? <Navbar initialUser={null} /> : null}
      <main
        className={cn(
          "mx-auto w-full max-w-6xl px-4 py-8 md:px-6 md:py-10",
          showTopMenu ? "min-h-[calc(100vh-4rem)]" : "min-h-screen",
        )}
      >
        {children}
      </main>
    </>
  );
}
