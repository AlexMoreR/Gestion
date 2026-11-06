"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowUpRight, MoreHorizontal, Pencil, ShoppingCart, StickyNote, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
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
import type { SeguimientoOrden, TipoEstadoEntrega } from "@/lib/delivery-tracking";
import { DeliveryStateChip } from "@/components/admin/delivery-state-chip";

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
  lastNote: { text: string; by: string; date: string } | null;
  // Productos con la entrega deshecha (solo cambia la etiqueta de una orden completada).
  reversedItems: number;
  // Peor estado de entrega y de fabricación; null en las compras.
  seguimiento: SeguimientoOrden | null;
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

// Chips «Entrega: …» y «Fabricación: …»; sin ninguno, «—».
function SeguimientoChips({ order }: { order: OrderRow }) {
  const entrega = order.seguimiento?.entrega?.peor;
  const fabricacion = order.seguimiento?.fabricacion?.peor;
  if (!entrega && !fabricacion) return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {entrega ? <DeliveryStateChip estado={{ ...entrega, etiqueta: `Entrega: ${entrega.etiqueta}` }} /> : null}
      {fabricacion ? (
        <DeliveryStateChip estado={{ ...fabricacion, etiqueta: `Fabricación: ${fabricacion.etiqueta}` }} />
      ) : null}
    </div>
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

// Dia de hoy (hora local).
function todayLocalDay(): string {
  return localDay(new Date().toISOString());
}

type OrdersWorkspaceProps = {
  orders: OrderRow[];
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
};

function StatusBadge({ order }: { order: OrderRow }) {
  const partial =
    order.status === "COMPLETED" && order.reversedItems > 0
      ? getOrderDisplayState(order.status, null, order.reversedItems)
      : null;
  return (
    <span
      className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium ${partial?.className ?? getOrderStatusBadgeClassName(order.status)}`}
    >
      {partial?.label ?? getOrderStatusLabel(order.status)}
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
        aria-label={`Última nota de ${displayCode(order.code)}`}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <StickyNote className="h-4 w-4" />
      </PopoverTrigger>
      <PopoverContent align="start" className="gap-1">
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
  currency,
  stats,
  purchaseProducts,
  purchaseSuppliersByProduct,
  purchaseComboComponents,
  purchaseSuppliers,
}: OrdersWorkspaceProps) {
  const defaultRange = React.useMemo(() => currentMonthRange(), []);
  const [fromDate, setFromDate] = React.useState(defaultRange.from);
  const [toDate, setToDate] = React.useState(defaultRange.to);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [seguimiento, setSeguimiento] = React.useState<TipoEstadoEntrega | "">("");
  const todayDay = React.useMemo(() => todayLocalDay(), []);

  const filtered = orders.filter((order) => {
    // Con filtro de seguimiento se ignora el rango de fechas (igual que al buscar), para no esconder atrasos viejos.
    if (seguimiento) return coincideSeguimiento(order, seguimiento);
    // Las ordenes activas (no cerradas ni canceladas) se "arrastran" al mes
    // actual: se filtran por hoy (no por su fecha real), asi las que siguen en
    // produccion/proceso quedan visibles hasta cerrarse. Las cerradas/canceladas
    // usan su fecha real.
    const isActive = order.status !== "COMPLETED" && order.status !== "CANCELLED";
    const day = isActive ? todayDay : localDay(order.orderDateISO);
    if (fromDate && day < fromDate) return false;
    if (toDate && day > toDate) return false;
    return true;
  });

  // Al buscar, la busqueda abarca TODAS las ordenes (el filtro de fechas solo
  // aplica por defecto, cuando no hay texto de busqueda).
  // El filtro de seguimiento se sigue aplicando aunque se busque.
  const tableData = searchQuery.trim()
    ? seguimiento
      ? orders.filter((order) => coincideSeguimiento(order, seguimiento))
      : orders
    : filtered;

  const dateFilter = (
    <div className="flex flex-wrap items-center gap-1.5">
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
      {fromDate || toDate ? (
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
      accessorKey: "code",
      header: "Orden",
      cell: ({ row }) => <span className="text-sm font-semibold text-foreground">{displayCode(row.original.code)}</span>,
    },
    {
      accessorKey: "saleCode",
      header: "Venta",
      cell: ({ row }) => <span className="text-sm text-foreground">{displayCode(row.original.saleCode)}</span>,
    },
    {
      accessorKey: "clientName",
      header: "Cliente",
      cell: ({ row }) => <span className="text-sm text-foreground">{row.original.clientName}</span>,
    },
    {
      accessorKey: "assignedToName",
      header: "Responsable",
      cell: ({ row }) => (
        <span className="text-sm text-foreground">{row.original.assignedToName ?? "Sin asignar"}</span>
      ),
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
      cell: ({ row }) => <SeguimientoChips order={row.original} />,
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
        <div className="flex justify-end">
          <RowActions order={row.original} />
        </div>
      ),
    },
  ];

  const renderMobileCard = (order: OrderRow) => (
    <article className="space-y-2.5 rounded-xl border border-border bg-card p-3">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1 text-sm font-semibold text-foreground">
            {displayCode(order.code)}
            <NoteIndicator order={order} />
          </p>
          <StatusBadge order={order} />
        </div>
        <p className="text-sm text-foreground">{displayCode(order.saleCode)}</p>
        <p className="text-sm text-foreground">{order.clientName}</p>
        <p className="text-xs text-muted-foreground">{order.assignedToName ?? "Sin asignar"}</p>
        <SeguimientoChips order={order} />
        <p className="text-sm font-semibold text-foreground">{formatMoney(order.total, currency)}</p>
        <p className="text-xs text-muted-foreground">{order.createdAt}</p>
      </div>
      <div className="flex items-center justify-end">
        <RowActions order={order} />
      </div>
    </article>
  );

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0 flex-1">
          <OperationsTabs />
        </div>
        <div className="-mb-px shrink-0 pb-1.5">
          <PurchaseDirectDialog
            products={purchaseProducts}
            suppliersByProduct={purchaseSuppliersByProduct}
            comboComponents={purchaseComboComponents}
            suppliers={purchaseSuppliers}
            currency={currency}
          />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-border bg-card/95">
          <CardContent className="space-y-2">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Ordenes</p>
            <p className="text-2xl font-semibold text-foreground">{stats.ordersCount}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card/95">
          <CardContent className="space-y-2">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Activas</p>
            <p className="text-2xl font-semibold text-foreground">{stats.activeCount}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card/95">
          <CardContent className="space-y-2">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Produccion</p>
            <p className="text-2xl font-semibold text-foreground">{stats.productionCount}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card/95">
          <CardContent className="space-y-2">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Cerradas</p>
            <p className="text-2xl font-semibold text-foreground">{stats.completedCount}</p>
          </CardContent>
        </Card>
      </div>

      <DataTable
        data={tableData}
        columns={columns}
        searchPlaceholder="Buscar orden, venta, cliente o nota"
        onSearchChange={setSearchQuery}
        emptyMessage="Aun no hay ordenes."
        pageSize={12}
        minWidth="min-w-[1180px]"
        toolbar={dateFilter}
        searchFirst
        renderMobileCard={renderMobileCard}
      />
    </section>
  );
}
