"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";

// Fila ya armada en el servidor: solo textos y la fecha estimada como "AAAA-MM-DD".
export type ShipmentTableRow = {
  id: string;
  code: string;
  statusLabel: string;
  statusBadge: string;
  incidentLabel: string | null;
  client: string;
  destination: string;
  currentCity: string;
  estimated: string | null;
  overdue: boolean;
  orderId: string;
  orderLabel: string;
};

function formatDay(day: string | null): string {
  return day
    ? new Date(`${day}T12:00:00Z`).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })
    : "—";
}

const columns: ColumnDef<ShipmentTableRow, unknown>[] = [
  {
    accessorKey: "code",
    header: "Guía",
    cell: ({ row }) => (
      <Link href={`/admin/despachos/guias/${row.original.id}`} className="whitespace-nowrap font-semibold text-primary hover:underline">
        {row.original.code}
      </Link>
    ),
  },
  {
    accessorKey: "statusLabel",
    header: "Estado",
    cell: ({ row }) => (
      <div className="flex flex-wrap items-center gap-1">
        <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${row.original.statusBadge}`}>
          {row.original.statusLabel}
        </span>
        {row.original.incidentLabel ? (
          <span className="whitespace-nowrap rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
            {row.original.incidentLabel}
          </span>
        ) : null}
      </div>
    ),
  },
  { accessorKey: "client", header: "Cliente" },
  { accessorKey: "destination", header: "Destino" },
  { accessorKey: "currentCity", header: "Va en" },
  {
    id: "estimada",
    // Sin fecha = undefined para que siempre vayan al final.
    accessorFn: (row) => row.estimated ?? undefined,
    sortUndefined: "last",
    header: "Fecha estimada",
    cell: ({ row }) => (
      <span className={`whitespace-nowrap ${row.original.overdue ? "font-semibold text-destructive" : ""}`}>
        {formatDay(row.original.estimated)}
      </span>
    ),
  },
  {
    accessorKey: "orderLabel",
    header: "Orden / Despacho",
    cell: ({ row }) => (
      <Link href={`/admin/ordenes/${row.original.orderId}`} className="whitespace-nowrap text-primary hover:underline">
        {row.original.orderLabel}
      </Link>
    ),
  },
];

export function ShipmentsTable({ rows }: { rows: ShipmentTableRow[] }) {
  return (
    <DataTable
      data={rows}
      columns={columns}
      searchable={false}
      paginate={false}
      emptyMessage="No hay guías en esta vista."
      minWidth="min-w-[860px]"
      initialSorting={[{ id: "estimada", desc: false }]}
      getRowClassName={(row) => (row.overdue ? "bg-destructive/10 hover:bg-destructive/15" : undefined)}
    />
  );
}
