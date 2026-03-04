"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import type { Role } from "@prisma/client";
import { ChevronDown, LayoutDashboard, LogOut, Menu, Search, Settings, UserCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const roleLinks = {
  ADMIN: "/admin",
  EMPLEADO: "/empleado",
  CLIENTE: "/cliente",
} as const;

type InitialUser = {
  name?: string | null;
  email?: string | null;
  role?: Role;
};

export function Navbar({ initialUser }: { initialUser: InitialUser | null }) {
  const { data, status } = useSession();
  const user = data?.user ?? initialUser;
  const pathname = usePathname();
  if (pathname === "/login" || pathname === "/register") return null;
  const dashboardHref = user?.role ? roleLinks[user.role] : null;
  const initials = (user?.name ?? user?.email ?? "U").slice(0, 1).toUpperCase();

  const navLinks = user
    ? [
        ...(dashboardHref ? [{ label: "Dashboard", href: dashboardHref }] : []),
        ...(user.role === "ADMIN" ? [{ label: "Configuracion", href: "/admin/configuracion" }] : []),
        { label: "Perfil", href: "/profile" },
      ]
    : [];
  const isActiveLink = (href: string) =>
    href === "/"
      ? pathname === "/"
      : pathname === href || pathname.startsWith(`${href}/`);
  const navLinkClass = (href: string) =>
    isActiveLink(href)
      ? "rounded-lg px-2.5 py-1 text-sm font-medium text-white bg-[var(--primary)]"
      : "rounded-md px-2 py-1 text-sm font-medium text-slate-900 transition hover:bg-slate-100";

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-white/95">
      <div className="mx-auto flex h-14 w-full items-center justify-between px-4 md:px-8">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--surface)] text-slate-900 transition hover:bg-slate-50"
            aria-label="Inicio"
          >
            <span className="text-sm font-semibold leading-none text-slate-900">A</span>
          </Link>

          <nav className="hidden items-center gap-4 md:flex">
            {navLinks.map((item) => {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={navLinkClass(item.href)}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <form action="/" method="get" className="mx-3 max-w-md flex-1">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              name="q"
              placeholder="Que estas buscando?"
              className="h-9 border-slate-200 bg-white pl-9 text-sm focus-visible:border-violet-400 focus-visible:ring-violet-200"
            />
          </div>
        </form>

        <div className="flex items-center gap-2">
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden" aria-label="Abrir menu">
                  <Menu className="h-4 w-4 text-slate-700" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 md:hidden">
                {navLinks.map((item) => (
                  <DropdownMenuItem key={item.href} asChild>
                    <Link href={item.href} className={isActiveLink(item.href) ? "w-full font-medium text-slate-900" : "w-full"}>
                      {item.label}
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}

          {status === "loading" ? (
            <div className="hidden h-8 w-24 animate-pulse rounded-md bg-slate-100 sm:block" />
          ) : !user ? (
            <Button asChild variant="ghost" size="sm" className="inline-flex items-center gap-2">
              <Link href="/login">
                <UserCircle2 className="h-4 w-4 text-slate-600" />
                Cuenta
              </Link>
            </Button>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2 px-2">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-700">
                    {initials}
                  </span>
                  <span className="hidden max-w-[10rem] truncate text-slate-800 sm:inline">
                    {user.name ?? user.email}
                  </span>
                  <ChevronDown className="h-4 w-4 text-slate-500" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="border-b border-slate-100 px-2 py-2">
                  <p className="truncate text-sm font-medium text-slate-900">{user.name ?? "Usuario"}</p>
                  <p className="truncate text-xs text-slate-500">{user.email}</p>
                </div>
                <DropdownMenuItem asChild>
                  <Link href="/profile" className="flex items-center gap-2">
                    <UserCircle2 className="h-4 w-4 text-slate-500" />
                    Perfil
                  </Link>
                </DropdownMenuItem>
                {dashboardHref && (
                  <DropdownMenuItem asChild>
                    <Link href={dashboardHref} className="flex items-center gap-2">
                      <LayoutDashboard className="h-4 w-4 text-slate-500" />
                      Dashboard
                    </Link>
                  </DropdownMenuItem>
                )}
                {user.role === "ADMIN" && (
                  <DropdownMenuItem asChild>
                    <Link href="/admin/configuracion" className="flex items-center gap-2">
                      <Settings className="h-4 w-4 text-slate-500" />
                      Configuracion
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/login" })} className="flex items-center gap-2">
                  <LogOut className="h-4 w-4 text-slate-500" />
                  Cerrar sesion
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </header>
  );
}
