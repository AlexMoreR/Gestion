"use client";

import * as React from "react";
import { Building2, ShieldCheck, UserPlus } from "lucide-react";
import { adminCreateUserAction, adminSetUserModuleAccessAction } from "@/app/actions/auth-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export type TeamModuleOption = {
  key: string;
  label: string;
  group: string;
};

export type TeamMember = {
  id: string;
  name: string | null;
  email: string;
  role: "ADMIN" | "EMPLEADO";
  modules: string[];
};

type TeamManagerProps = {
  members: TeamMember[];
  modules: TeamModuleOption[];
  returnTo: string;
};

export function TeamManager({ members, modules, returnTo }: TeamManagerProps) {
  // Agrupa los modulos por su "group" para mostrarlos ordenados.
  const groupedModules = React.useMemo(() => {
    const groups = new Map<string, TeamModuleOption[]>();
    for (const moduleItem of modules) {
      const current = groups.get(moduleItem.group) ?? [];
      current.push(moduleItem);
      groups.set(moduleItem.group, current);
    }
    return Array.from(groups.entries());
  }, [modules]);

  const employees = members.filter((member) => member.role === "EMPLEADO");
  const admins = members.filter((member) => member.role === "ADMIN");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Building2 className="h-4 w-4" /> Equipos
          </h3>
          <p className="text-sm text-muted-foreground">
            Agrega integrantes a tu negocio y elige a qué módulos puede entrar cada uno.
          </p>
        </div>

        <Dialog>
          <DialogTrigger
            render={
              <Button className="bg-[var(--primary)] text-white hover:bg-[var(--primary-strong)]">
                <UserPlus className="h-4 w-4" /> Agregar integrante
              </Button>
            }
          />
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Agregar integrante</DialogTitle>
              <DialogDescription>
                Se le enviará un correo de invitación para que cree su propia contraseña. Luego marca
                sus módulos aquí abajo.
              </DialogDescription>
            </DialogHeader>
            <form action={adminCreateUserAction} className="space-y-3">
              <input type="hidden" name="role" value="EMPLEADO" />
              <input type="hidden" name="returnTo" value={returnTo} />
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-foreground">Nombre</span>
                <Input type="text" name="name" placeholder="Nombre completo" required />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-foreground">Correo</span>
                <Input type="email" name="email" placeholder="correo@ejemplo.com" required />
              </label>
              <Button
                type="submit"
                className="w-full bg-[var(--primary)] text-white hover:bg-[var(--primary-strong)]"
              >
                Enviar invitación
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Dueños / admins: acceso total */}
      {admins.map((member) => (
        <Card key={member.id} className="border-border">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                {member.name || member.email}
              </p>
              <p className="truncate text-xs text-muted-foreground">{member.email}</p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
              <ShieldCheck className="h-3.5 w-3.5" /> Dueño · acceso total
            </span>
          </CardContent>
        </Card>
      ))}

      {/* Empleados: acceso por módulo */}
      {employees.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
          Aún no hay integrantes. Usa “Agregar integrante” para invitar a alguien (por ejemplo a tu equipo
          de ventas).
        </p>
      ) : (
        employees.map((member) => {
          const allowed = new Set(member.modules);
          return (
            <Card key={member.id} className="border-border">
              <CardContent className="space-y-3 p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {member.name || member.email}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{member.email} · Empleado</p>
                </div>

                <form action={adminSetUserModuleAccessAction} className="space-y-3">
                  <input type="hidden" name="userId" value={member.id} />
                  <input type="hidden" name="returnTo" value={returnTo} />

                  <div className="grid gap-3 sm:grid-cols-2">
                    {groupedModules.map(([group, items]) => (
                      <div key={group} className="rounded-lg border border-border p-3">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {group}
                        </p>
                        <div className="space-y-1.5">
                          {items.map((moduleItem) => (
                            <label
                              key={moduleItem.key}
                              className="flex items-center gap-2 text-sm text-foreground"
                            >
                              <input
                                type="checkbox"
                                name="modules"
                                value={moduleItem.key}
                                defaultChecked={allowed.has(moduleItem.key)}
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
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
