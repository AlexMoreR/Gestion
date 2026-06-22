"use client";

import * as React from "react";
import {
  ArrowDown,
  ArrowDownUp,
  ArrowUp,
  ArrowUpDown,
  Boxes,
  Eye,
  EyeOff,
  LayoutGrid,
  List,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ProductThumb } from "@/components/admin/product-thumb";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ProductStock, StockStatus } from "@/modules/inventory/domain/entities";
import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";

type ProductStockTableProps = {
  data: ProductStock[];
  currency: SupportedCurrencyCode;
  onOpenProduct: (productId: string) => void;
  onMove: (productId: string) => void;
  onEditMin: (productId: string) => void;
};

const STATUS_BADGE: Record<StockStatus, { label: string; className: string }> = {
  OK: {
    label: "Disponible",
    className: "border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  },
  LOW: {
    label: "Bajo stock",
    className: "border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-400",
  },
  OUT: {
    label: "Agotado",
    className: "border-destructive/30 bg-destructive/15 text-destructive",
  },
};

type SortKey = "name" | "stock" | "minStock" | "status";
type SortDirection = "asc" | "desc";

const PAGE_SIZE = 12;

function formatDate(value: Date | null): string {
  if (!value) {
    return "Sin movimientos";
  }
  return new Date(value).toLocaleDateString("es-CO", { year: "numeric", month: "short", day: "2-digit" });
}

function stockClass(status: StockStatus): string {
  return status === "OUT"
    ? "text-destructive"
    : status === "LOW"
      ? "text-amber-600 dark:text-amber-400"
      : "text-foreground";
}

function HeaderLabel({
  children,
  active,
  direction,
  onClick,
  icon,
}: {
  children: React.ReactNode;
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      className="h-auto gap-1 px-0 py-0 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:bg-transparent hover:text-foreground"
      onClick={onClick}
      aria-label={`Ordenar por ${String(children)}`}
    >
      {icon ? <span className="text-muted-foreground">{icon}</span> : null}
      {children}
      {active ? (
        direction === "asc" ? (
          <ArrowUp className="h-3.5 w-3.5" />
        ) : (
          <ArrowDown className="h-3.5 w-3.5" />
        )
      ) : (
        <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
      )}
    </Button>
  );
}

export function ProductStockTable({ data, currency, onOpenProduct, onMove, onEditMin }: ProductStockTableProps) {
  const [query, setQuery] = React.useState("");
  const [showOut, setShowOut] = React.useState(false);
  const [viewMode, setViewMode] = React.useState<"grid" | "table">("grid");
  const [sortKey, setSortKey] = React.useState<SortKey>("name");
  const [sortDirection, setSortDirection] = React.useState<SortDirection>("asc");
  const [page, setPage] = React.useState(1);

  const outCount = React.useMemo(() => data.filter((item) => item.status === "OUT").length, [data]);

  const filtered = React.useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return data.filter((item) => {
      if (!showOut && item.status === "OUT") {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }
      return [item.name, item.code ?? ""].join(" ").toLowerCase().includes(normalizedQuery);
    });
  }, [data, query, showOut]);

  const sorted = React.useMemo(() => {
    const list = [...filtered];
    const factor = sortDirection === "asc" ? 1 : -1;
    const statusOrder: Record<StockStatus, number> = { OUT: 0, LOW: 1, OK: 2 };
    list.sort((a, b) => {
      switch (sortKey) {
        case "name":
          return a.name.localeCompare(b.name, "es", { sensitivity: "base" }) * factor;
        case "stock":
          return (a.stock - b.stock) * factor;
        case "minStock":
          return (a.minStock - b.minStock) * factor;
        case "status":
          return (statusOrder[a.status] - statusOrder[b.status]) * factor;
        default:
          return 0;
      }
    });
    return list;
  }, [filtered, sortKey, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));

  React.useEffect(() => {
    setPage(1);
  }, [query, showOut]);

  React.useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const pageStart = (page - 1) * PAGE_SIZE;
  const paged = sorted.slice(pageStart, pageStart + PAGE_SIZE);
  const rangeStart = sorted.length === 0 ? 0 : pageStart + 1;
  const rangeEnd = Math.min(pageStart + PAGE_SIZE, sorted.length);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((value) => (value === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection("asc");
  };

  const emptyMessage = showOut
    ? "No hay productos tipo Stock. Crea uno o cambia su modo de cumplimiento a 'Stock'."
    : "No hay productos con existencias. Activa 'Mostrar agotados' para ver los que estan en 0.";

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-end">
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto lg:justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 shrink-0"
            onClick={() => setShowOut((current) => !current)}
          >
            {showOut ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {showOut ? "Ocultar agotados" : `Mostrar agotados${outCount ? ` (${outCount})` : ""}`}
          </Button>
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar producto"
              className="h-9 pl-9 pr-9"
            />
            {query ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="absolute right-1 top-1/2 -translate-y-1/2"
                onClick={() => setQuery("")}
                aria-label="Limpiar busqueda"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            ) : null}
          </div>
          <div className="flex items-center gap-0.5 self-end rounded-lg border border-border p-0.5 sm:self-auto">
            <Button
              type="button"
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8"
              onClick={() => setViewMode("grid")}
              aria-label="Vista cuadricula"
              title="Cuadricula"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant={viewMode === "table" ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8"
              onClick={() => setViewMode("table")}
              aria-label="Vista tabla"
              title="Tabla"
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {viewMode === "grid" ? (
        paged.length === 0 ? (
          <div className="rounded-xl border border-border bg-card px-3 py-8 text-center text-sm text-muted-foreground">
            {emptyMessage}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {paged.map((item) => {
              return (
                <div
                  key={item.productId}
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpenProduct(item.productId)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onOpenProduct(item.productId);
                    }
                  }}
                  className="flex cursor-pointer items-stretch overflow-hidden border border-border bg-card text-left transition hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="relative w-16 shrink-0 self-stretch">
                    <ProductThumb
                      src={item.thumbnailUrl}
                      alt={item.name}
                      className="h-full w-full bg-muted object-cover"
                    />
                    <span
                      className={`absolute bottom-1 right-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold text-white shadow ${
                        item.stock <= 0 ? "bg-orange-500" : "bg-emerald-500"
                      }`}
                    >
                      {item.stock}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1 p-3">
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-sm font-semibold text-foreground">{item.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{item.code ?? "Sin codigo"}</p>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <Badge
                        variant="outline"
                        className="max-w-[55%] truncate border-border bg-muted/50 text-muted-foreground"
                      >
                        {item.categoryName ?? "Sin categoria"}
                      </Badge>
                      <span className="text-sm font-semibold text-foreground">
                        {formatMoney(item.price, currency)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>
                  <HeaderLabel
                    active={sortKey === "name"}
                    direction={sortDirection}
                    onClick={() => toggleSort("name")}
                    icon={<Boxes className="h-3.5 w-3.5" />}
                  >
                    Producto
                  </HeaderLabel>
                </TableHead>
                <TableHead>
                  <HeaderLabel active={sortKey === "stock"} direction={sortDirection} onClick={() => toggleSort("stock")}>
                    Stock
                  </HeaderLabel>
                </TableHead>
                <TableHead>
                  <HeaderLabel active={sortKey === "minStock"} direction={sortDirection} onClick={() => toggleSort("minStock")}>
                    Minimo
                  </HeaderLabel>
                </TableHead>
                <TableHead>
                  <HeaderLabel active={sortKey === "status"} direction={sortDirection} onClick={() => toggleSort("status")}>
                    Estado
                  </HeaderLabel>
                </TableHead>
                <TableHead>
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Ultimo movimiento</span>
                </TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    {emptyMessage}
                  </TableCell>
                </TableRow>
              ) : (
                paged.map((item) => {
                  const badge = STATUS_BADGE[item.status];
                  return (
                    <TableRow key={item.productId}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <ProductThumb
                            src={item.thumbnailUrl}
                            alt={item.name}
                            className="h-10 w-10 rounded-md border border-border object-cover"
                          />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
                            {item.code ? (
                              <p className="truncate text-xs text-muted-foreground">{item.code}</p>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={`text-sm font-semibold ${stockClass(item.status)}`}>{item.stock}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">{item.minStock}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={badge.className}>
                          {badge.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">{formatDate(item.lastMovementAt)}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8"
                            onClick={() => onMove(item.productId)}
                          >
                            <ArrowDownUp className="h-4 w-4" />
                            Mover
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => onEditMin(item.productId)}
                            aria-label="Editar stock minimo"
                            title="Editar stock minimo"
                          >
                            <SlidersHorizontal className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          Mostrando {rangeStart}-{rangeEnd} de {sorted.length}
        </p>
        <div className="flex items-center gap-2 self-end sm:self-auto">
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
