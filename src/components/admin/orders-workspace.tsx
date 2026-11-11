"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, ArrowUpRight, CalendarClock, Factory, MessageSquareText, MoreHorizontal, PackageCheck, Pencil, ShoppingCart, Undo2, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { StatList } from "@/components/ui/stat-list";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { OperationsTabs } from "@/components/admin/operations-tabs";
import { PurchaseDirectDialog } from "@/components/admin/purchase-direct-dialog";
import { PurchaseDeleteMenuItem, PurchaseDeleteDialog } from "@/components/admin/purchase-delete-menu-item";
import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";
import { getOrderDisplayState, getOrderStatusBadgeClassName, getOrderStatusLabel } from "@/lib/orders";
import { displayCode } from "@/lib/code-display";
import { formatNoteCount } from "@/lib/order-notes";
import type { SeguimientoOrden, TipoEstadoEntrega } from "@/lib/delivery-tracking";
import { DeliveryStateChip } from "@/components/admin/delivery-state-chip";
import { adminAssignOrderAction } from "@/app/actions/orders-actions";
import {
  alertasDeOrden,
  coincideVista,
  compararPorUrgencia,
  nombrePropio,
  ordenCerrada,
  siguienteAccion,
  type ResponsableEtapa,
  type VistaOrdenes,
} from "@/lib/order-list-view";

type PurchaseProductOption = {
  id: string;
  name: string;
  code: string | null;
  baseCost: number;
  stock: number;
  thumbnailUrl: string;
  isBundle: boolean;
};

type OrderRow = {
  kind: "order" | "purchase";
  id: string;
  code: string;
  saleCode: string;
  clientName: string;
  assignedToName: string | null;
  total: number;
  status: "DRAFT" | "RELEASED" | "IN_PRODUCTION" | "READY_FOR_DISPATCH" | "DISPATCHED" | "COMPLETED" | "CANCELLED";
  createdAt: string;
  orderDateISO: string;
  notesText: string;
  notesCount: number;
  lastNote: { text: string; by: string; date: string } | null;
  // Productos con la entrega deshecha (solo cambia la etiqueta de una orden completada).
  reversedItems: number;
  // Etiqueta de devolución (estadoDevolucionDeOrden); null en las compras o sin devolución.
  devolucion: "DEVUELTA" | "PARCIAL" | "FALTA_REGISTRAR" | null;
  // Peor estado de entrega y de fabricación; null en las compras.
  seguimiento: SeguimientoOrden | null;
  // Quién debe mover la orden según la etapa (responsableDeEtapa); null = nadie.
  responsable: ResponsableEtapa | null;
  // Tiene productos de fabricación sin confirmar (la siguiente acción es "Fabricar").
  porFabricar: boolean;
};

const SEGUIMIENTO_OPCIONES: { value: TipoEstadoEntrega; label: string }[] = [
  { value: "A_TIEMPO", label: "A tiempo" },
  { value: "POR_VENCER", label: "Por vencer" },
  { value: "ATRASADO", label: "Atrasado" },
  { value: "EN_CAMINO", label: "En camino" },
  { value: "ENTREGADO_A_TIEMPO", label: "Entregado a tiempo" },
  { value: "ENTREGADO_TARDE", label: "Entregado tarde" },
  { value: "SIN_FECHA", label: "Sin fecha" },
];

function coincideSeguimiento(order: OrderRow, tipo: TipoEstadoEntrega): boolean {
  const s = order.seguimiento;
  return s?.entrega?.peor.tipo === tipo || s?.fabricacion?.peor.tipo === tipo;
}

// Una sola etiqueta, la más urgente («Entrega: …» o «Fabricación: …»); las demás al pasar el mouse.
function AlertaChip({ order }: { order: OrderRow }) {
  const alertas = alertasDeOrden(order.seguimiento);
  if (alertas.length === 0) return <span className="text-sm text-muted-foreground">—</span>;
  const chip = (alerta: (typeof alertas)[number]) => (
    <DeliveryStateChip estado={{ ...alerta.estado, etiqueta: `${alerta.parte}: ${alerta.estado.etiqueta}` }} />
  );
  if (alertas.length === 1) return chip(alertas[0]);
  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={150}
        aria-label={`Ver las ${alertas.length} alertas de ${displayCode(order.code)}`}
        className="inline-flex items-center gap-1 rounded-md text-left"
      >
        {chip(alertas[0])}
        <span className="text-[11px] font-medium text-muted-foreground">+{alertas.length - 1}</span>
      </PopoverTrigger>
      <PopoverContent align="start" className="gap-1.5">
        {alertas.map((alerta, index) => (
          <div key={index}>{chip(alerta)}</div>
        ))}
      </PopoverContent>
    </Popover>
  );
}

// Quién debe mover la orden; sin nadie, «Sin asignar» en rojo y se asigna eligiendo a la persona.
function ResponsableCell({ order, staff }: { order: OrderRow; staff: { id: string; name: string }[] }) {
  if (order.kind === "purchase" || ordenCerrada(order.status)) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }
  if (order.responsable) {
    return (
      <div className="leading-tight">
        <p className="text-sm text-foreground">{order.responsable.nombre}</p>
        {order.responsable.rol !== "Asignada" ? (
          <p className="text-[11px] text-muted-foreground">{order.responsable.rol}</p>
        ) : null}
      </div>
    );
  }
  return (
    <form action={adminAssignOrderAction}>
      <input type="hidden" name="orderId" value={order.id} />
      <input type="hidden" name="returnTo" value="/admin/ordenes" />
      <select
        name="assignedToId"
        defaultValue=""
        aria-label={`Asignar responsable de ${displayCode(order.code)}`}
        onChange={(event) => {
          if (event.currentTarget.value) event.currentTarget.form?.requestSubmit();
        }}
        className="h-7 max-w-32 rounded-md border border-red-500/40 bg-red-500/10 px-1.5 text-xs font-medium text-red-600 outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 dark:text-red-400"
      >
        <option value="" disabled>
          Sin asignar
        </option>
        {staff.map((person) => (
          <option key={person.id} value={person.id}>
            {person.name}
          </option>
        ))}
      </select>
    </form>
  );
}

// Botón con lo siguiente que hay que hacer; abre el detalle, donde se hace la acción.
function NextActionButton({ order }: { order: OrderRow }) {
  const label = siguienteAccion(order);
  if (!label) return null;
  return (
    <Link href={`/admin/ordenes/${order.id}`} className={`${buttonVariants({ variant: "outline", size: "sm" })} whitespace-nowrap px-2 text-xs`}>
      {label}
    </Link>
  );
}

// Dia local (YYYY-MM-DD) de la fecha de la orden, para comparar con el rango.
function localDay(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Rango por defecto: primer y ultimo dia del mes actual (hora local).
function currentMonthRange(): { from: string; to: string } {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  const fmt = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: fmt(first), to: fmt(last) };
}

type OrdersWorkspaceProps = {
  orders: OrderRow[];
  returnedCount: number;
  currency: SupportedCurrencyCode;
  stats: {
    ordersCount: number;
    activeCount: number;
    productionCount: number;
    readyToDispatchCount: number;
    completedCount: number;
  };
  purchaseProducts: PurchaseProductOption[];
  purchaseSuppliersByProduct: Record<string, { id: string; name: string; cost: number | null }[]>;
  purchaseComboComponents: Record<
    string,
    { childId: string; name: string; code: string | null; quantity: number; thumbnailUrl: string }[]
  >;
  purchaseSuppliers: { id: string; name: string }[];
  staff: { id: string; name: string }[];
};

function StatusBadge({ order }: { order: OrderRow }) {
  // Devolución y entrega parcial: mismo estado que el detalle. Lo demás sigue con la etiqueta de siempre.
  const special =
    (order.devolucion && order.status !== "CANCELLED") || (order.status === "COMPLETED" && order.reversedItems > 0)
      ? getOrderDisplayState(order.status, null, order.reversedItems, order.devolucion)
      : null;
  return (
    <span
      className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium ${special?.className ?? getOrderStatusBadgeClassName(order.status)}`}
    >
      {special?.label ?? getOrderStatusLabel(order.status)}
    </span>
  );
}

// Ícono de nota: al pasar el mouse o tocarlo muestra la última nota de la orden.
function NoteIndicator({ order }: { order: OrderRow }) {
  const note = order.lastNote;
  if (!note) return null;
  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={150}
        aria-label={`Notas internas de ${displayCode(order.code)} (${order.notesCount} ${order.notesCount === 1 ? "nota" : "notas"})`}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-primary hover:bg-muted"
      >
        <MessageSquareText className="h-4 w-4" />
      </PopoverTrigger>
      <PopoverContent align="start" className="gap-1">
        <p className="text-xs font-semibold text-foreground">
          Notas internas ({formatNoteCount(order.notesCount)}) · última:
        </p>
        <p className="whitespace-pre-wrap break-words text-sm text-foreground">{note.text}</p>
        <p className="text-xs text-muted-foreground">
          {note.by} · {note.date}
        </p>
      </PopoverContent>
    </Popover>
  );
}

function RowActions({ order }: { order: OrderRow }) {
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={`Acciones ${displayCode(order.code)}`}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/admin/ordenes/${order.id}`}>
              <ArrowUpRight className="mr-2 h-4 w-4" />
              Abrir
            </Link>
          </DropdownMenuItem>
          {order.kind === "order" ? (
            <DropdownMenuItem asChild>
              <Link href={`/admin/ventas`}>
                <ShoppingCart className="mr-2 h-4 w-4" />
                Ver ventas
              </Link>
            </DropdownMenuItem>
          ) : null}
          {order.kind === "purchase" ? (
            <>
              <DropdownMenuItem asChild>
                <Link href={`/admin/ordenes/${order.id}/editar-compra`}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Editar compra
                </Link>
              </DropdownMenuItem>
              {order.status !== "CANCELLED" ? (
                <>
                  <DropdownMenuSeparator />
                  <PurchaseDeleteMenuItem onSelect={() => setDeleteOpen(true)} />
                </>
              ) : null}
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {order.kind === "purchase" ? (
        <PurchaseDeleteDialog
          orderId={order.id}
          code={order.code}
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
        />
      ) : null}
    </>
  );
}

export function OrdersWorkspace({
  orders,
  returnedCount,
  currency,
  stats,
  purchaseProducts,
  purchaseSuppliersByProduct,
  purchaseComboComponents,
  purchaseSuppliers,
  staff,
}: OrdersWorkspaceProps) {
  const defaultRange = React.useMemo(() => currentMonthRange(), []);
  const [fromDate, setFromDate] = React.useState(defaultRange.from);
  const [toDate, setToDate] = React.useState(defaultRange.to);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [seguimiento, setSeguimiento] = React.useState<TipoEstadoEntrega | "">("");
  // Tarjeta elegida arriba (Atrasadas, Listas...): filtra la tabla; otra vez la misma la quita.
  const [vista, setVista] = React.useState<VistaOrdenes | null>(null);

  // Las ordenes abiertas salen siempre, sea cual sea el rango; el rango solo filtra las cerradas/canceladas.
  const filtered = orders.filter((order) => {
    if (!ordenCerrada(order.status)) return true;
    const day = localDay(order.orderDateISO);
    if (fromDate && day < fromDate) return false;
    if (toDate && day > toDate) return false;
    return true;
  });

  // Al buscar, con Seguimiento o con una tarjeta se ven TODAS las ordenes (sin el rango de fechas);
  // los filtros se suman. Por defecto van por urgencia; las columnas se pueden seguir ordenando.
  let visibles = searchQuery.trim() || seguimiento || vista ? orders : filtered;
  if (seguimiento) visibles = visibles.filter((order) => coincideSeguimiento(order, seguimiento));
  if (vista) visibles = visibles.filter((order) => coincideVista(order, vista));
  const tableData = [...visibles].sort(compararPorUrgencia);

  const cuentas = React.useMemo(() => {
    const contar = (v: VistaOrdenes) => orders.filter((order) => coincideVista(order, v)).length;
    return { ATRASADAS: contar("ATRASADAS"), LISTAS: contar("LISTAS"), VENCEN: contar("VENCEN"), PRODUCCION: contar("PRODUCCION") };
  }, [orders]);
  const elegir = (v: VistaOrdenes) => setVista((actual) => (actual === v ? null : v));

  const dateFilter = (
    <div className="flex flex-wrap items-center gap-1.5 sm:ml-auto">
      <label className="flex w-full items-center gap-1.5 text-xs text-muted-foreground sm:w-auto">
        <span className="shrink-0">Seguimiento</span>
        <select
          value={seguimiento}
          onChange={(event) => setSeguimiento(event.target.value as TipoEstadoEntrega | "")}
          className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm text-foreground transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:w-40"
        >
          <option value="">Todos</option>
          {SEGUIMIENTO_OPCIONES.map((opcion) => (
            <option key={opcion.value} value={opcion.value}>
              {opcion.label}
            </option>
          ))}
        </select>
      </label>
      {/* Con seguimiento o una tarjeta el rango no aplica: se oculta para que no parezca que falló. */}
      {seguimiento || vista ? (
        <span className="text-xs text-muted-foreground">Todas las fechas</span>
      ) : (
        <DateRangePicker
          from={fromDate}
          to={toDate}
          onChange={(range) => {
            setFromDate(range.from);
            setToDate(range.to);
          }}
          aria-label="Rango de fechas"
          className="sm:w-64"
          placeholder="Rango de fechas"
        />
      )}
      {!seguimiento && !vista && (fromDate || toDate) ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => {
            setFromDate("");
            setToDate("");
          }}
          aria-label="Limpiar fechas"
          title="Limpiar fechas"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      ) : null}
      <div className="ml-auto">
        <PurchaseDirectDialog
          products={purchaseProducts}
          suppliersByProduct={purchaseSuppliersByProduct}
          comboComponents={purchaseComboComponents}
          suppliers={purchaseSuppliers}
          currency={currency}
        />
      </div>
    </div>
  );

  const columns: ColumnDef<OrderRow>[] = [
    {
      // El valor (texto de las notas) es lo que lee el buscador; la celda solo muestra el ícono.
      accessorKey: "notesText",
      header: "",
      enableSorting: false,
      cell: ({ row }) => <NoteIndicator order={row.original} />,
    },
    {
      // Orden y venta en la misma celda (el buscador encuentra las dos).
      id: "code",
      accessorFn: (order) => `${order.code} ${order.saleCode}`,
      header: "Orden",
      cell: ({ row }) => (
        <div className="leading-tight">
          <p className="whitespace-nowrap text-sm font-semibold text-foreground">{displayCode(row.original.code)}</p>
          <p className="text-xs text-muted-foreground">{displayCode(row.original.saleCode)}</p>
        </div>
      ),
    },
    {
      accessorKey: "clientName",
      header: "Cliente",
      cell: ({ row }) => (
        <span className="block min-w-32 text-sm text-foreground">{nombrePropio(row.original.clientName)}</span>
      ),
    },
    {
      id: "responsable",
      accessorFn: (order) => order.responsable?.nombre ?? "",
      header: "Responsable",
      cell: ({ row }) => <ResponsableCell order={row.original} staff={staff} />,
    },
    {
      accessorKey: "status",
      header: "Estado",
      cell: ({ row }) => <StatusBadge order={row.original} />,
    },
    {
      id: "seguimiento",
      header: "Entrega y fabricación",
      enableSorting: false,
      cell: ({ row }) => <AlertaChip order={row.original} />,
    },
    {
      accessorKey: "total",
      header: "Total",
      cell: ({ row }) => (
        <span className="text-sm font-semibold text-foreground">{formatMoney(row.original.total, currency)}</span>
      ),
    },
    {
      accessorKey: "createdAt",
      header: "Fecha",
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.createdAt}</span>,
    },
    {
      id: "acciones",
      header: "",
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-1">
          <NextActionButton order={row.original} />
          <RowActions order={row.original} />
        </div>
      ),
    },
  ];

  // Celular: cliente, estado, alerta, total y el botón de la siguiente acción.
  const renderMobileCard = (order: OrderRow) => (
    <article className="space-y-2 rounded-xl border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{nombrePropio(order.clientName)}</p>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            {displayCode(order.code)} · {displayCode(order.saleCode)}
            <NoteIndicator order={order} />
          </p>
        </div>
        <StatusBadge order={order} />
      </div>
      <AlertaChip order={order} />
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">{formatMoney(order.total, currency)}</p>
        <div className="flex items-center gap-1">
          <NextActionButton order={order} />
          <RowActions order={order} />
        </div>
      </div>
    </article>
  );

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0 flex-1">
          <OperationsTabs />
        </div>
        <div className="-mb-px flex shrink-0 items-center gap-1.5 pb-1.5">
          <Link href="/admin/ordenes/devoluciones?abiertas=1" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <Undo2 className="h-4 w-4" />
            Devueltas ({returnedCount})
          </Link>
        </div>
      </div>

      <div className="space-y-1.5">
        <StatList
          items={[
            { label: "Atrasadas", value: String(cuentas.ATRASADAS), icon: AlertTriangle, tone: "danger", onClick: () => elegir("ATRASADAS"), active: vista === "ATRASADAS" },
            { label: "Listas para despacho", value: String(cuentas.LISTAS), icon: PackageCheck, onClick: () => elegir("LISTAS"), active: vista === "LISTAS" },
            { label: "Vencen hoy o mañana", value: String(cuentas.VENCEN), icon: CalendarClock, onClick: () => elegir("VENCEN"), active: vista === "VENCEN" },
            { label: "En producción", value: String(cuentas.PRODUCCION), icon: Factory, onClick: () => elegir("PRODUCCION"), active: vista === "PRODUCCION" },
          ]}
        />
        <p className="flex flex-wrap items-center gap-x-2 px-1 text-xs text-muted-foreground">
          <span>
            {stats.ordersCount} órdenes en la lista · {stats.completedCount} cerradas
          </span>
          {vista ? (
            <button type="button" onClick={() => setVista(null)} className="font-medium text-primary hover:underline">
              Ver todas
            </button>
          ) : null}
        </p>
      </div>

      <DataTable
        data={tableData}
        columns={columns}
        searchPlaceholder="Buscar orden, venta, cliente o nota"
        onSearchChange={setSearchQuery}
        emptyMessage={vista ? "Ninguna orden en esa tarjeta." : seguimiento ? "Ninguna orden con ese seguimiento." : "Aun no hay ordenes."}
        pageSize={12}
        minWidth="min-w-[980px]"
        toolbar={dateFilter}
        searchFirst
        searchGrow
        renderMobileCard={renderMobileCard}
      />
    </section>
  );
}
