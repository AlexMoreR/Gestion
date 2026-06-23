"use client";

import * as React from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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

const PAGE_SIZE = 10;

function displayEmail(email: string): string {
  return email.endsWith("@sin-correo.local") ? "Sin correo" : email;
}

export function ClientsDataTable({ clients }: { clients: ClientRow[] }) {
  const [query, setQuery] = React.useState("");
  const [page, setPage] = React.useState(1);

  const filtered = React.useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return clients;
    return clients.filter((client) =>
      `${client.name ?? ""} ${displayEmail(client.email)} ${client.document ?? ""} ${client.phone ?? ""}`
        .toLowerCase()
        .includes(normalized),
    );
  }, [clients, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  React.useEffect(() => {
    setPage(1);
  }, [query]);

  React.useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageStart = (page - 1) * PAGE_SIZE;
  const paged = filtered.slice(pageStart, pageStart + PAGE_SIZE);
  const rangeStart = filtered.length === 0 ? 0 : pageStart + 1;
  const rangeEnd = Math.min(pageStart + PAGE_SIZE, filtered.length);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <p className="text-sm text-muted-foreground">
          {filtered.length} cliente{filtered.length === 1 ? "" : "s"}
        </p>
        <div className="relative w-full md:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nombre, correo, documento o telefono"
            className="pl-9 pr-9"
          />
          {query ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setQuery("")}
              className="absolute right-1 top-1/2 -translate-y-1/2"
              aria-label="Limpiar busqueda"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border">
        <Table className="min-w-[760px]">
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Documento</TableHead>
              <TableHead>Telefono</TableHead>
              <TableHead>Ciudad</TableHead>
              <TableHead>Cotizaciones</TableHead>
              <TableHead>Alta</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  No hay clientes para el filtro actual.
                </TableCell>
              </TableRow>
            ) : (
              paged.map((client) => (
                <TableRow key={client.id}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">
                        {(client.name?.charAt(0) || client.email.charAt(0)).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{client.name || "Sin nombre"}</p>
                        <p className="truncate text-xs text-muted-foreground">{displayEmail(client.email)}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{client.document || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{client.phone || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{client.city || "—"}</TableCell>
                  <TableCell className="text-sm text-foreground">{client.quotesCount}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{client.createdAt}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Mostrando {rangeStart}-{rangeEnd} de {filtered.length}
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            disabled={page <= 1}
          >
            Anterior
          </Button>
          <span className="text-xs text-muted-foreground">
            Pagina {page} de {totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
            disabled={page >= totalPages}
          >
            Siguiente
          </Button>
        </div>
      </div>
    </div>
  );
}
