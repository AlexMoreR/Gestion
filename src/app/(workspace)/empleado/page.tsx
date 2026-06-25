import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardList, Factory, Clock, CheckCircle2 } from "lucide-react";
import { auth } from "@/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { getOrderStatusLabel, getProductionJobStatusLabel } from "@/lib/orders";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

function formatDate(value: Date | null): string {
  if (!value) return "—";
  return value.toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
}

const OPEN_ORDER_STATUSES = ["DRAFT", "RELEASED", "IN_PRODUCTION", "READY_FOR_DISPATCH"] as const;

export default async function EmpleadoPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const userId = session.user.id;
  const [orders, jobs] = await Promise.all([
    prisma.order.findMany({
      where: { assignedToId: userId, status: { in: [...OPEN_ORDER_STATUSES] } },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        code: true,
        status: true,
        createdAt: true,
        client: { select: { name: true } },
        _count: { select: { items: true } },
      },
    }),
    prisma.productionJob.findMany({
      where: { assignedToId: userId, status: { in: ["PENDING", "IN_PROGRESS", "PAUSED"] } },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: 8,
      select: {
        id: true,
        code: true,
        status: true,
        quantity: true,
        dueDate: true,
        order: { select: { code: true } },
      },
    }),
  ]);

  const pendingJobs = jobs.filter((j) => j.status === "PENDING").length;
  const inProgressJobs = jobs.filter((j) => j.status === "IN_PROGRESS").length;

  const summary = [
    { label: "Órdenes asignadas", value: String(orders.length), icon: ClipboardList, accent: "text-blue-600", bg: "bg-blue-100" },
    { label: "Trabajos por hacer", value: String(pendingJobs), icon: Clock, accent: "text-amber-600", bg: "bg-amber-100" },
    { label: "En proceso", value: String(inProgressJobs), icon: Factory, accent: "text-purple-600", bg: "bg-purple-100" },
    { label: "Tareas activas", value: String(jobs.length), icon: CheckCircle2, accent: "text-emerald-600", bg: "bg-emerald-100" },
  ];

  return (
    <section className="app-page space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Hola, {session.user.name ?? "empleado"}</h1>
        <p className="text-sm text-muted-foreground">Tu trabajo asignado del día.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {summary.map((item) => (
          <Card key={item.label}>
            <CardContent className="flex items-center gap-3 py-4">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${item.bg} ${item.accent}`}>
                <item.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold">{item.value}</p>
                <p className="text-xs text-muted-foreground">{item.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Órdenes asignadas</CardTitle>
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-2">
            {orders.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No tienes órdenes asignadas.</p>
            ) : (
              orders.map((order) => (
                <Link
                  key={order.id}
                  href={`/admin/ordenes/${order.id}`}
                  className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 transition-colors hover:bg-muted"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{order.code}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {order.client.name ?? "Cliente"} · {order._count.items} ítem(s)
                    </p>
                  </div>
                  <Badge variant="outline">{getOrderStatusLabel(order.status)}</Badge>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Trabajos de producción</CardTitle>
            <Factory className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-2">
            {jobs.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No tienes trabajos pendientes.</p>
            ) : (
              jobs.map((job) => (
                <Link
                  key={job.id}
                  href="/admin/produccion"
                  className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 transition-colors hover:bg-muted"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{job.code}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {job.order.code} · {job.quantity} und
                      {job.dueDate ? ` · vence ${formatDate(job.dueDate)}` : ""}
                    </p>
                  </div>
                  <Badge variant="outline">{getProductionJobStatusLabel(job.status)}</Badge>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
