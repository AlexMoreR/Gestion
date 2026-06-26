import { redirect } from "next/navigation";
import Link from "next/link";
import { Activity, Filter } from "lucide-react";
import { auth } from "@/auth";
import { ConfigTabs } from "@/components/admin/config-tabs";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const PAGE_SIZE = 30;

const ACTION_LABELS: Record<string, string> = {
  CREATE: "Creó",
  UPDATE: "Actualizó",
  DELETE: "Eliminó",
};

const ACTION_BADGE: Record<string, string> = {
  CREATE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  UPDATE: "bg-amber-50 text-amber-700 border-amber-200",
  DELETE: "bg-red-50 text-red-700 border-red-200",
};

const ENTITY_LABELS: Record<string, string> = {
  PRODUCT: "Producto",
  QUOTE: "Cotizacion",
  ORDER: "Orden",
  SALE: "Venta",
  EXPENSE: "Gasto",
  EXPENSE_CATEGORY: "Categoria de gasto",
  INVENTORY: "Inventario",
  PURCHASE: "Compra",
  CATEGORY: "Categoria",
  SUPPLIER: "Proveedor",
  ACCOUNT: "Cuenta",
};

const ALLOWED_ACTIONS = ["CREATE", "UPDATE", "DELETE"] as const;

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(value);
}

export default async function AdminConfiguracionActividadPage({ searchParams }: PageProps) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    redirect("/unauthorized");
  }

  const canAccess = await hasAdminModuleAccess(session.user.id, session.user.role, "config_business");
  if (!canAccess) {
    redirect("/unauthorized");
  }

  const params = await searchParams;
  const actorId = firstParam(params.actor);
  const actionParam = firstParam(params.accion);
  const entityParam = firstParam(params.entidad);
  const query = firstParam(params.q).trim();
  const pageParam = Number.parseInt(firstParam(params.page), 10);
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;

  const action = ALLOWED_ACTIONS.includes(actionParam as (typeof ALLOWED_ACTIONS)[number])
    ? (actionParam as (typeof ALLOWED_ACTIONS)[number])
    : undefined;
  const entityType = ENTITY_LABELS[entityParam] ? entityParam : undefined;

  const where = {
    ...(actorId ? { actorId } : {}),
    ...(action ? { action } : {}),
    ...(entityType ? { entityType } : {}),
    ...(query ? { summary: { contains: query, mode: "insensitive" as const } } : {}),
  };

  let total = 0;
  let logs: Array<{
    id: string;
    actorName: string;
    action: string;
    entityType: string;
    summary: string;
    createdAt: Date;
  }> = [];
  let employees: Array<{ id: string; name: string | null; email: string }> = [];

  try {
    [total, logs, employees] = await Promise.all([
      prisma.activityLog.count({ where }),
      prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.user.findMany({
        where: { role: { in: ["ADMIN", "EMPLEADO"] } },
        select: { id: true, name: true, email: true },
        orderBy: { name: "asc" },
      }),
    ]);
  } catch {
    // La tabla de actividad puede no existir aun (migracion pendiente): degradar a vacio.
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  const buildPageHref = (targetPage: number): string => {
    const sp = new URLSearchParams();
    if (actorId) sp.set("actor", actorId);
    if (action) sp.set("accion", action);
    if (entityType) sp.set("entidad", entityType);
    if (query) sp.set("q", query);
    sp.set("page", String(targetPage));
    return `/admin/configuracion/actividad?${sp.toString()}`;
  };

  return (
    <section className="w-full space-y-5">
      <ConfigTabs />

      <Card>
        <CardHeader>
          <CardTitle className="inline-flex items-center gap-2">
            <Activity className="h-4 w-4 text-slate-500" />
            Actividad de empleados
          </CardTitle>
          <CardDescription>
            Registro de creaciones, actualizaciones y eliminaciones realizadas por cada usuario.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form method="get" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <select name="actor" defaultValue={actorId} className="field-select" aria-label="Empleado">
              <option value="">Todos los empleados</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name?.trim() || employee.email}
                </option>
              ))}
            </select>

            <select name="accion" defaultValue={action ?? ""} className="field-select" aria-label="Accion">
              <option value="">Todas las acciones</option>
              {ALLOWED_ACTIONS.map((value) => (
                <option key={value} value={value}>
                  {ACTION_LABELS[value]}
                </option>
              ))}
            </select>

            <select name="entidad" defaultValue={entityType ?? ""} className="field-select" aria-label="Modulo">
              <option value="">Todos los modulos</option>
              {Object.entries(ENTITY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>

            <Input name="q" defaultValue={query} placeholder="Buscar en la descripcion" className="lg:col-span-1" />

            <Button type="submit" className="gap-1.5">
              <Filter className="h-4 w-4" />
              Filtrar
            </Button>
          </form>

          <div className="overflow-hidden rounded-xl border border-[var(--line)]">
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow className="bg-slate-50/70 hover:bg-slate-50/70">
                  <TableHead className="normal-case">Fecha</TableHead>
                  <TableHead className="normal-case">Empleado</TableHead>
                  <TableHead className="normal-case">Accion</TableHead>
                  <TableHead className="normal-case">Modulo</TableHead>
                  <TableHead className="normal-case">Detalle</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-9 text-center text-slate-500">
                      No hay actividad para el filtro actual.
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap text-xs text-slate-500">
                        {formatDateTime(log.createdAt)}
                      </TableCell>
                      <TableCell className="text-sm font-medium text-slate-800">{log.actorName}</TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "inline-flex rounded-md border px-2 py-0.5 text-xs font-medium",
                            ACTION_BADGE[log.action] ?? "border-slate-200 bg-slate-50 text-slate-700",
                          )}
                        >
                          {ACTION_LABELS[log.action] ?? log.action}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-slate-600">
                        {ENTITY_LABELS[log.entityType] ?? log.entityType}
                      </TableCell>
                      <TableCell className="text-sm text-slate-700">{log.summary}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500">
              Mostrando {rangeStart}-{rangeEnd} de {total}
            </p>
            <div className="flex items-center gap-2 self-end sm:self-auto">
              <Link
                href={buildPageHref(page - 1)}
                className={cn(
                  buttonVariants({ variant: "ghost", size: "sm" }),
                  page <= 1 && "pointer-events-none opacity-50",
                )}
                aria-disabled={page <= 1}
              >
                Anterior
              </Link>
              <span className="text-xs text-slate-600">
                Pagina {page} de {totalPages}
              </span>
              <Link
                href={buildPageHref(page + 1)}
                className={cn(
                  buttonVariants({ variant: "ghost", size: "sm" }),
                  page >= totalPages && "pointer-events-none opacity-50",
                )}
                aria-disabled={page >= totalPages}
              >
                Siguiente
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
