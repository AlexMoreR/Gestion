"use client";

import Link from "next/link";
import * as React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Edit3, Search, Trash2, X } from "lucide-react";
import { adminDeleteProductAction } from "@/app/actions/product-actions";
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
import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";

type ProductRow = {
  id: string;
  code: string | null;
  name: string;
  categoryName: string | null;
  supplierName: string | null;
  thumbnailUrl: string;
  baseCost: number;
  price: number;
  wholesalePrice: number;
  minWholesaleQty: number;
};

type ProductsDataTableProps = {
  products: ProductRow[];
  currency: SupportedCurrencyCode;
};

type SortKey = "producto" | "categoria" | "proveedor" | "costo" | "detal" | "acciones";
type SortDirection = "asc" | "desc";

const PAGE_SIZE = 12;

function normalizeFilterText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function HeaderLabel({
  children,
  active,
  direction,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-2 text-[15px] font-medium text-slate-600 transition hover:text-slate-900"
      onClick={onClick}
      aria-label={`Ordenar por ${String(children)}`}
    >
      {children}
      {active ? (
        direction === "asc" ? (
          <ArrowUp className="h-3.5 w-3.5 text-slate-700" />
        ) : (
          <ArrowDown className="h-3.5 w-3.5 text-slate-700" />
        )
      ) : (
        <ArrowUpDown className="h-3.5 w-3.5 text-slate-500" />
      )}
    </button>
  );
}

export function ProductsDataTable({ products, currency }: ProductsDataTableProps) {
  const [query, setQuery] = React.useState("");
  const [categoryFilter, setCategoryFilter] = React.useState("__all__");
  const [sortKey, setSortKey] = React.useState<SortKey>("producto");
  const [sortDirection, setSortDirection] = React.useState<SortDirection>("asc");
  const [page, setPage] = React.useState(1);

  const categoryOptions = React.useMemo(() => {
    const map = new Map<string, string>();

    for (const product of products) {
      const label = product.categoryName ?? "Sin categoria";
      const normalized = normalizeFilterText(label);
      if (!map.has(normalized)) {
        map.set(normalized, label);
      }
    }

    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "es"));
  }, [products]);

  const filteredProducts = React.useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return products.filter((product) => {
      const haystack = [
        product.name,
        product.code ?? "",
        product.categoryName ?? "",
        product.supplierName ?? "",
      ]
        .join(" ")
        .toLowerCase();

      const queryMatches = !normalizedQuery || haystack.includes(normalizedQuery);
      const categoryLabel = product.categoryName ?? "Sin categoria";
      const normalizedCategory = normalizeFilterText(categoryLabel);
      const categoryMatches = categoryFilter === "__all__" || categoryFilter === normalizedCategory;

      return queryMatches && categoryMatches;
    });
  }, [products, query, categoryFilter]);

  const sortedProducts = React.useMemo(() => {
    const list = [...filteredProducts];
    const directionFactor = sortDirection === "asc" ? 1 : -1;

    const textCompare = (a: string, b: string) =>
      a.localeCompare(b, "es", { sensitivity: "base" });

    list.sort((a, b) => {
      switch (sortKey) {
        case "producto":
        case "acciones":
          return textCompare(a.name, b.name) * directionFactor;
        case "categoria":
          return textCompare(a.categoryName ?? "Sin categoria", b.categoryName ?? "Sin categoria") * directionFactor;
        case "proveedor":
          return textCompare(a.supplierName ?? "Sin proveedor", b.supplierName ?? "Sin proveedor") * directionFactor;
        case "costo":
          return (a.baseCost - b.baseCost) * directionFactor;
        case "detal":
          return (a.price - b.price) * directionFactor;
        default:
          return 0;
      }
    });

    return list;
  }, [filteredProducts, sortKey, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(sortedProducts.length / PAGE_SIZE));

  React.useEffect(() => {
    setPage(1);
  }, [query, categoryFilter]);

  React.useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const pageStart = (page - 1) * PAGE_SIZE;
  const pagedProducts = sortedProducts.slice(pageStart, pageStart + PAGE_SIZE);
  const rangeStart = sortedProducts.length === 0 ? 0 : pageStart + 1;
  const rangeEnd = Math.min(pageStart + PAGE_SIZE, sortedProducts.length);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((value) => (value === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection("asc");
  };

  const handleDelete = (productId: string, productName: string) => {
    if (!window.confirm(`Eliminar "${productName}"? Esta accion no se puede deshacer.`)) {
      return;
    }
    const form = document.getElementById(`delete-product-${productId}`) as HTMLFormElement | null;
    form?.requestSubmit();
  };

  return (
    <div className="space-y-3">
      <div className="flex w-full flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative w-full flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nombre, codigo, categoria o proveedor"
            className="h-9 pr-9 pl-9 text-sm"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              aria-label="Limpiar busqueda"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            ) : null}
        </div>
        <div className="flex items-center gap-2 lg:ml-auto">
          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            className="h-9 min-w-40 rounded-lg border border-[var(--line)] bg-white px-2.5 text-sm text-slate-700 outline-none transition focus:border-[var(--line-strong)]"
            aria-label="Filtrar por categoria"
          >
            <option value="__all__">Todas las categorias</option>
            {categoryOptions.map((category) => (
              <option key={category.value} value={category.value}>
                {category.label}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 px-3 text-xs"
            onClick={() => {
              setQuery("");
              setCategoryFilter("__all__");
            }}
            disabled={!query && categoryFilter === "__all__"}
          >
            Limpiar filtros
          </Button>
        </div>
      </div>

      <Table className="min-w-[980px]">
        <TableHeader>
          <TableRow className="bg-slate-50/70 hover:bg-slate-50/70">
            <TableHead className="normal-case tracking-normal">
              <HeaderLabel
                active={sortKey === "producto"}
                direction={sortDirection}
                onClick={() => toggleSort("producto")}
              >
                Producto
              </HeaderLabel>
            </TableHead>
            <TableHead className="normal-case tracking-normal">
              <HeaderLabel
                active={sortKey === "categoria"}
                direction={sortDirection}
                onClick={() => toggleSort("categoria")}
              >
                Categoria
              </HeaderLabel>
            </TableHead>
            <TableHead className="normal-case tracking-normal">
              <HeaderLabel
                active={sortKey === "proveedor"}
                direction={sortDirection}
                onClick={() => toggleSort("proveedor")}
              >
                Proveedor
              </HeaderLabel>
            </TableHead>
            <TableHead className="normal-case tracking-normal">
              <HeaderLabel
                active={sortKey === "costo"}
                direction={sortDirection}
                onClick={() => toggleSort("costo")}
              >
                Costo
              </HeaderLabel>
            </TableHead>
            <TableHead className="normal-case tracking-normal">
              <HeaderLabel
                active={sortKey === "detal"}
                direction={sortDirection}
                onClick={() => toggleSort("detal")}
              >
                Detal
              </HeaderLabel>
            </TableHead>
            <TableHead className="normal-case tracking-normal">
              <HeaderLabel
                active={sortKey === "acciones"}
                direction={sortDirection}
                onClick={() => toggleSort("acciones")}
              >
                Acciones
              </HeaderLabel>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pagedProducts.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="py-9 text-center text-slate-500">
                No hay productos para el filtro actual.
              </TableCell>
            </TableRow>
          ) : (
            pagedProducts.map((product) => (
              <TableRow key={product.id}>
                <TableCell>
                  <Link
                    href={`/admin/productos/${product.id}`}
                    className="group flex items-center gap-2.5 rounded-md p-1 -m-1 transition hover:bg-slate-50"
                  >
                    <img
                      src={product.thumbnailUrl}
                      alt={product.name}
                      className="h-10 w-10 rounded-md border border-[var(--line)] object-cover"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900 group-hover:text-slate-700">
                        {product.name}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {product.code ? `Codigo: ${product.code}` : "Sin codigo"}
                      </p>
                    </div>
                  </Link>
                </TableCell>
                <TableCell className="text-sm text-slate-600">
                  <span className="inline-flex rounded-md border border-[var(--line)] bg-slate-50 px-2 py-1 text-xs">
                    {product.categoryName ?? "Sin categoria"}
                  </span>
                </TableCell>
                <TableCell className="text-sm text-slate-600">
                  <span className="inline-flex rounded-md border border-[var(--line)] bg-slate-50 px-2 py-1 text-xs">
                    {product.supplierName ?? "Sin proveedor"}
                  </span>
                </TableCell>
                <TableCell className="text-sm font-medium text-slate-700">
                  {formatMoney(product.baseCost, currency)}
                </TableCell>
                <TableCell className="text-sm font-semibold text-slate-800">
                  {formatMoney(product.price, currency)}
                </TableCell>
                <TableCell>
                  <form id={`delete-product-${product.id}`} action={adminDeleteProductAction}>
                    <input type="hidden" name="productId" value={product.id} />
                  </form>
                  <div className="flex items-center gap-1">
                    <Button asChild type="button" variant="ghost" size="icon" className="h-8 w-8 border border-transparent hover:border-[var(--line)]">
                      <Link href={`/admin/productos/${product.id}`} aria-label={`Editar ${product.name}`}>
                        <Edit3 className="h-4 w-4 text-slate-600" />
                      </Link>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 border border-transparent text-red-600 hover:border-red-100 hover:bg-red-50 hover:text-red-700"
                      onClick={() => handleDelete(product.id, product.name)}
                      aria-label={`Eliminar ${product.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          Mostrando {rangeStart}-{rangeEnd} de {filteredProducts.length}
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            disabled={page <= 1}
          >
            Anterior
          </Button>
          <span className="text-xs text-slate-600">
            Pagina {page} de {totalPages}
          </span>
          <Button
            type="button"
            variant="ghost"
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
