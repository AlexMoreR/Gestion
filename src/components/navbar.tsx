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
      ? "rounded-full bg-violet-900 px-3 py-1.5 text-xs font-semibold text-white shadow-[0_6px_16px_-10px_rgba(76,29,149,0.9)]"
      : "rounded-full px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-violet-50 hover:text-violet-900";

  return (
    <header className="sticky top-0 z-40 border-b border-violet-100/70 bg-gradient-to-r from-violet-50/85 via-white to-violet-50/70 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full items-center justify-between gap-2 px-3 md:px-7">
        <div className="flex min-w-0 items-center gap-2.5">
          <Link
            href="/"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-900 via-violet-800 to-fuchsia-800 text-white shadow-[0_10px_22px_-14px_rgba(91,33,182,0.95)] transition hover:scale-[1.02]"
            aria-label="Inicio"
          >
            <span className="text-sm font-bold leading-none text-white">IM</span>
          </Link>
          <Link href="/" className="hidden min-w-0 sm:block">
            <p className="truncate text-sm font-semibold tracking-tight text-slate-900">Inovacciones Magi</p>
            <p className="-mt-0.5 text-[11px] font-medium text-violet-700/80">Muebles de peluqueria</p>
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

        <form action="/" method="get" className="mx-1 max-w-xl flex-1">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-violet-500" />
            <Input
              name="q"
              placeholder="Que estas buscando?"
              className="h-10 rounded-full border-violet-200/90 bg-white/95 pl-9 pr-4 text-sm text-slate-800 shadow-[0_10px_24px_-18px_rgba(15,23,42,0.65)] focus-visible:border-violet-500 focus-visible:ring-violet-200"
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
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="inline-flex h-10 items-center gap-2 rounded-full border border-violet-200 bg-white/90 px-3 text-violet-900 shadow-[0_8px_18px_-14px_rgba(91,33,182,0.95)] transition hover:border-violet-300 hover:bg-violet-50"
            >
              <Link href="/login">
                <UserCircle2 className="h-4 w-4 text-slate-600" />
                <span>Cuenta</span>
              </Link>
            </Button>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-10 gap-2 rounded-full border border-violet-200 bg-white/90 px-2.5 text-slate-900 shadow-[0_8px_18px_-14px_rgba(91,33,182,0.95)] transition hover:border-violet-300 hover:bg-violet-50"
                >
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
