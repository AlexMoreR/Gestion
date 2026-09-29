"use client";

import * as React from "react";
import { Role } from "@prisma/client";
import { ChevronDown, MoreVertical, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import {
  adminDeleteUserAction,
  adminSetUserModuleAccessAction,
  adminUpdateUserRoleAction,
} from "@/app/actions/auth-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ModuleOption = { key: string; label: string; group: string };

type UserRow = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  role: Role;
  createdAt: Date;
  modules: string[];
};

type UsersDataTableProps = {
  users: UserRow[];
  moduleOptions: ModuleOption[];
};

const RETURN_TO = "/admin/configuracion/usuarios";

const PAGE_SIZE = 8;

export function UsersDataTable({ users, moduleOptions }: UsersDataTableProps) {
  const [query, setQuery] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [selectedRoles, setSelectedRoles] = React.useState<Record<string, Role>>({});
  // Dialogo activo (editar modulos o eliminar) para un usuario puntual.
  const [dialog, setDialog] = React.useState<{ user: UserRow; type: "modules" | "delete" } | null>(null);

  const groupedModules = React.useMemo(() => {
    const groups = new Map<string, ModuleOption[]>();
    for (const moduleItem of moduleOptions) {
      const current = groups.get(moduleItem.group) ?? [];
      current.push(moduleItem);
      groups.set(moduleItem.group, current);
    }
    return Array.from(groups.entries());
  }, [moduleOptions]);

  const filteredUsers = React.useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return users
      .filter((user) => {
        if (!normalizedQuery) return true;
        const haystack = `${user.name ?? ""} ${user.email}`.toLowerCase();
        return haystack.includes(normalizedQuery);
      })
      .sort((a, b) => {
        const aTime = new Date(a.createdAt).getTime();
        const bTime = new Date(b.createdAt).getTime();
        return bTime - aTime;
      });
  }, [users, query]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));

  React.useEffect(() => {
    setPage(1);
  }, [query]);

  React.useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const pageStart = (page - 1) * PAGE_SIZE;
  const pagedUsers = filteredUsers.slice(pageStart, pageStart + PAGE_SIZE);
  const rangeStart = filteredUsers.length === 0 ? 0 : pageStart + 1;
  const rangeEnd = Math.min(pageStart + PAGE_SIZE, filteredUsers.length);

  const roleLabel: Record<Role, string> = {
    ADMIN: "Admin",
    EMPLEADO: "Empleado",
    CLIENTE: "Cliente",
  };

  const roleBadgeClass: Record<Role, string> = {
    ADMIN: "bg-blue-50 text-blue-700 ring-blue-200",
    EMPLEADO: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    CLIENTE: "bg-slate-100 text-slate-700 ring-slate-200",
  };

  const getRoleValue = (userId: string, fallbackRole: Role) =>
    selectedRoles[userId] ?? fallbackRole;

  const handleRoleSelect = (userId: string, role: Role) => {
    setSelectedRoles((current) => ({ ...current, [userId]: role }));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 border-b border-[var(--line)] pb-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900">Directorio de usuarios</p>
          <p className="text-xs text-slate-500">
            {filteredUsers.length} usuario{filteredUsers.length === 1 ? "" : "s"} en la vista actual
          </p>
        </div>
        <div className="relative w-full md:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nombre o correo"
            className="h-9 pr-9 pl-9 text-sm"
          />
          {query ? (
            <Button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              aria-label="Limpiar busqueda"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
      </div>

      <Table className="min-w-[760px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="normal-case tracking-normal">Usuario</TableHead>
            <TableHead className="normal-case tracking-normal">Alta</TableHead>
            <TableHead className="normal-case tracking-normal">Rol actual</TableHead>
            <TableHead className="normal-case tracking-normal">Rol</TableHead>
            <TableHead className="text-right normal-case tracking-normal">Accion</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pagedUsers.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="py-8 text-center text-slate-500">
                No hay resultados para el filtro actual.
              </TableCell>
            </TableRow>
          ) : (
            pagedUsers.map((user) => (
              <TableRow key={user.id}>
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    {user.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={user.image}
                        alt={user.name || user.email}
                        referrerPolicy="no-referrer"
                        className="h-8 w-8 rounded-md object-cover"
                      />
                    ) : (
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-slate-100 text-xs font-semibold text-slate-700">
                        {(user.name?.charAt(0) || user.email.charAt(0)).toUpperCase()}
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">{user.name || "Sin nombre"}</p>
                      <p className="truncate text-xs text-slate-500">{user.email}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-slate-600">
                  {new Date(user.createdAt).toLocaleDateString("es-MX")}
                </TableCell>
                <TableCell>
                  <span className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ring-1 ${roleBadgeClass[user.role]}`}>
                    {roleLabel[user.role]}
                  </span>
                </TableCell>
                <TableCell>
                  <form id={`user-role-${user.id}`} action={adminUpdateUserRoleAction} className="flex items-center gap-2">
                    <input type="hidden" name="userId" value={user.id} />
                    <input type="hidden" name="role" value={getRoleValue(user.id, user.role)} />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 min-w-28 justify-between px-2 text-[11px] font-semibold"
                        >
                          {roleLabel[getRoleValue(user.id, user.role)]}
                          <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="min-w-28 rounded-lg">
                        <DropdownMenuItem onSelect={() => handleRoleSelect(user.id, "ADMIN")}>
                          ADMIN
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => handleRoleSelect(user.id, "EMPLEADO")}>
                          EMPLEADO
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => handleRoleSelect(user.id, "CLIENTE")}>
                          CLIENTE
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </form>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <Button
                      type="submit"
                      form={`user-role-${user.id}`}
                      variant="outline"
                      size="sm"
                      className="h-8 px-2.5 text-xs"
                    >
                      Aplicar
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label="Mas acciones"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="min-w-44 rounded-lg">
                        {user.role === "EMPLEADO" ? (
                          <DropdownMenuItem onSelect={() => setDialog({ user, type: "modules" })}>
                            <SlidersHorizontal className="mr-2 h-4 w-4" /> Editar modulos
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuItem
                          onSelect={() => setDialog({ user, type: "delete" })}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Eliminar usuario
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          Mostrando {rangeStart}-{rangeEnd} de {filteredUsers.length}
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            disabled={page <= 1}
          >
            Anterior
          </Button>
          <span className="text-xs text-slate-600">
            Pagina {page} de {totalPages}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
            disabled={page >= totalPages}
          >
            Siguiente
          </Button>
        </div>
      </div>

      {/* Editar modulos de un empleado */}
      <Dialog
        open={dialog?.type === "modules"}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Modulos de {dialog?.user.name || dialog?.user.email}</DialogTitle>
            <DialogDescription>
              Marca a que modulos puede entrar esta persona. Configuracion del negocio queda solo para el
              dueno.
            </DialogDescription>
          </DialogHeader>
          {dialog?.type === "modules" ? (
            <form action={adminSetUserModuleAccessAction} className="space-y-3">
              <input type="hidden" name="userId" value={dialog.user.id} />
              <input type="hidden" name="returnTo" value={RETURN_TO} />
              <div className="grid max-h-[55vh] gap-3 overflow-y-auto sm:grid-cols-2">
                {groupedModules.map(([group, items]) => (
                  <div key={group} className="rounded-lg border border-[var(--line)] p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {group}
                    </p>
                    <div className="space-y-1.5">
                      {items.map((moduleItem) => (
                        <label key={moduleItem.key} className="flex items-center gap-2 text-sm text-slate-800">
                          <input
                            type="checkbox"
                            name="modules"
                            value={moduleItem.key}
                            defaultChecked={dialog.user.modules.includes(moduleItem.key)}
                            className="h-4 w-4 accent-[var(--primary)]"
                          />
                          {moduleItem.label}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-end">
                <Button
                  type="submit"
                  className="bg-[var(--primary)] text-white hover:bg-[var(--primary-strong)]"
                >
                  Guardar acceso
                </Button>
              </div>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Eliminar usuario */}
      <Dialog
        open={dialog?.type === "delete"}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminar usuario</DialogTitle>
            <DialogDescription>
              Se eliminara la cuenta de{" "}
              <span className="font-medium text-slate-900">{dialog?.user.name || dialog?.user.email}</span>. Esta
              accion no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          {dialog?.type === "delete" ? (
            <form action={adminDeleteUserAction} className="flex items-center justify-end gap-2">
              <input type="hidden" name="userId" value={dialog.user.id} />
              <input type="hidden" name="returnTo" value={RETURN_TO} />
              <Button type="button" variant="outline" onClick={() => setDialog(null)}>
                Cancelar
              </Button>
              <Button type="submit" variant="destructive">
                Eliminar
              </Button>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
