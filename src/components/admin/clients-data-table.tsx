"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";

export type ClientRow = {
  id: string;
  name: string | null;
  email: string;
  document: string | null;
  phone: string | null;
  city: string | null;
  quotesCount: number;
  ordersCount: number;
  createdAt: string;
};

function displayEmail(email: string): string {
  return email.endsWith("@sin-correo.local") ? "Sin correo" : email;
}

export function ClientsDataTable({ clients }: { clients: ClientRow[] }) {
  const columns = React.useMemo<ColumnDef<ClientRow, unknown>[]>(
    () => [
      {
        id: "cliente",
        accessorFn: (row) => `${row.name ?? ""} ${displayEmail(row.email)}`,
        header: "Cliente",
        cell: ({ row }) => {
          const client = row.original;
          return (
            <div className="flex items-center gap-2.5">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">
                {(client.name?.charAt(0) || client.email.charAt(0)).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{client.name || "Sin nombre"}</p>
                <p className="truncate text-xs text-muted-foreground">{displayEmail(client.email)}</p>
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: "document",
        header: "Documento",
        cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.document || "—"}</span>,
      },
      {
        accessorKey: "phone",
        header: "Telefono",
        cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.phone || "—"}</span>,
      },
      {
        accessorKey: "city",
        header: "Ciudad",
        cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.city || "—"}</span>,
      },
      {
        accessorKey: "quotesCount",
        header: "Cotizaciones",
        cell: ({ row }) => <span className="text-sm text-foreground">{row.original.quotesCount}</span>,
      },
      {
        accessorKey: "createdAt",
        header: "Alta",
        cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.createdAt}</span>,
      },
    ],
    [],
  );

  return (
    <DataTable
      data={clients}
      columns={columns}
      searchPlaceholder="Buscar por nombre, correo, documento o telefono"
      emptyMessage="No hay clientes para el filtro actual."
      pageSize={10}
      minWidth="min-w-[760px]"
    />
  );
}
