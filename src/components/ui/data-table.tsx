"use client";

import * as React from "react";
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, Search, X } from "lucide-react";
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

export type DataTableProps<TData> = {
  data: TData[];
  columns: ColumnDef<TData, unknown>[];
  /** Titulo opcional mostrado a la izquierda de la barra de controles. */
  title?: string;
  description?: string;
  /** Muestra el buscador global. Por defecto true. */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Valor inicial del buscador global. */
  initialSearch?: string;
  emptyMessage: string;
  pageSize?: number;
  /** Activa el paginado. Por defecto true. */
  paginate?: boolean;
  /** Nodo extra junto al buscador (filtros, botones, etc.). */
  toolbar?: React.ReactNode;
  /** Si es true, el buscador se muestra antes de la toolbar. Por defecto false. */
  searchFirst?: boolean;
  onRowClick?: (row: TData) => void;
  /** Clase de ancho minimo de la tabla (scroll horizontal). */
  minWidth?: string;
  /** Si se entrega, en movil se ocultan las filas y se renderiza esta tarjeta por fila. */
  renderMobileCard?: (row: TData) => React.ReactNode;
  initialSorting?: SortingState;
  /** Muestra una fila de totales (usa el `footer` definido en cada columna). */
  showFooter?: boolean;
};

export function DataTable<TData>({
  data,
  columns,
  title,
  description,
  searchable = true,
  searchPlaceholder = "Buscar",
  initialSearch = "",
  emptyMessage,
  pageSize = 10,
  paginate = true,
  toolbar,
  searchFirst = false,
  onRowClick,
  minWidth = "min-w-[760px]",
  renderMobileCard,
  initialSorting = [],
  showFooter = false,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = React.useState<SortingState>(initialSorting);
  const [globalFilter, setGlobalFilter] = React.useState(initialSearch);
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize });

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter, pagination },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    globalFilterFn: (row, _columnId, filterValue) => {
      const query = String(filterValue ?? "").trim().toLowerCase();
      if (!query) {
        return true;
      }

      return row
        .getAllCells()
        .some((cell) => String(cell.getValue() ?? "").toLowerCase().includes(query));
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    ...(paginate ? { getPaginationRowModel: getPaginationRowModel() } : {}),
  });

  const rows = table.getRowModel().rows;
  const hasHeaderBar = Boolean(title) || searchable || Boolean(toolbar);

  return (
    <div className="space-y-3">
      {hasHeaderBar ? (
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          {title ? (
            <div className="space-y-1">
              <h2 className="text-sm font-semibold tracking-tight text-foreground">{title}</h2>
              {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
            </div>
          ) : null}
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto lg:justify-end">
            {searchFirst ? null : toolbar}
            {searchable ? (
              <div className="relative w-full sm:max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={globalFilter}
                  onChange={(event) => {
                    setGlobalFilter(event.target.value);
                    setPagination((current) => ({ ...current, pageIndex: 0 }));
                  }}
                  placeholder={searchPlaceholder}
                  className="h-9 pl-9 pr-9"
                />
                {globalFilter ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="absolute right-1 top-1/2 -translate-y-1/2"
                    onClick={() => setGlobalFilter("")}
                    aria-label="Limpiar busqueda"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
              </div>
            ) : null}
            {searchFirst ? toolbar : null}
          </div>
        </div>
      ) : null}

      <div
        className={`overflow-hidden rounded-xl border border-border bg-card${
          renderMobileCard ? " hidden md:block" : ""
        }`}
      >
        <Table className={minWidth}>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="bg-muted/40 hover:bg-muted/40">
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-auto gap-1 px-0 py-0 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:bg-transparent hover:text-foreground"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {{
                          asc: <ArrowUp className="h-3.5 w-3.5" />,
                          desc: <ArrowDown className="h-3.5 w-3.5" />,
                        }[header.column.getIsSorted() as string] ?? (
                          <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </Button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="py-10 text-center text-sm text-muted-foreground">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={onRowClick ? "cursor-pointer" : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="py-1.5">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
          {showFooter && rows.length > 0 ? (
            <tfoot>
              {table.getFooterGroups().map((footerGroup) => (
                <TableRow key={footerGroup.id} className="border-t-2 border-border bg-muted/50 font-semibold hover:bg-muted/50">
                  {footerGroup.headers.map((header) => (
                    <TableCell key={header.id} className="py-2.5">
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.footer, header.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </tfoot>
          ) : null}
        </Table>
      </div>

      {renderMobileCard ? (
        <div className="space-y-2 md:hidden">
          {rows.length === 0 ? (
            <div className="rounded-xl border border-border bg-card px-3 py-6 text-center text-sm text-muted-foreground">
              {emptyMessage}
            </div>
          ) : (
            rows.map((row) => (
              <React.Fragment key={row.id}>{renderMobileCard(row.original)}</React.Fragment>
            ))
          )}
        </div>
      ) : null}

      {paginate ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Mostrando {rows.length === 0 ? 0 : table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}
            -
            {Math.min(
              (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
              table.getFilteredRowModel().rows.length,
            )}{" "}
            de {table.getFilteredRowModel().rows.length}
          </p>
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Anterior
            </Button>
            <span className="text-xs text-muted-foreground">
              Pagina {table.getState().pagination.pageIndex + 1} de {table.getPageCount() || 1}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Siguiente
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
