"use client";

import Link from "next/link";
import * as React from "react";
import { Edit3, Search, Trash2, X } from "lucide-react";
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

const PAGE_SIZE = 12;

function normalizeFilterText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function ProductsDataTable({ products, currency }: ProductsDataTableProps) {
  const [query, setQuery] = React.useState("");
  const [categoryFilter, setCategoryFilter] = React.useState("__all__");
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

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));

  React.useEffect(() => {
    setPage(1);
  }, [query, categoryFilter]);

  React.useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const pageStart = (page - 1) * PAGE_SIZE;
  const pagedProducts = filteredProducts.slice(pageStart, pageStart + PAGE_SIZE);
  const rangeStart = filteredProducts.length === 0 ? 0 : pageStart + 1;
  const rangeEnd = Math.min(pageStart + PAGE_SIZE, filteredProducts.length);

  const handleDelete = (productId: string, productName: string) => {
    if (!window.confirm(`Eliminar "${productName}"? Esta accion no se puede deshacer.`)) {
      return;
    }
    const form = document.getElementById(`delete-product-${productId}`) as HTMLFormElement | null;
    form?.requestSubmit();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 border-b border-[var(--line)] pb-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900">Catalogo de productos</p>
          <p className="text-xs text-slate-500">
            {filteredProducts.length} producto{filteredProducts.length === 1 ? "" : "s"} en la vista actual
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center">
          <div className="relative w-full md:w-[22rem]">
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
          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            className="h-9 min-w-36 rounded-lg border border-[var(--line)] bg-white px-2.5 text-sm text-slate-700 outline-none transition focus:border-[var(--line-strong)]"
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
            className="h-9 px-2.5 text-xs"
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
          <TableRow className="hover:bg-transparent">
            <TableHead className="normal-case tracking-normal">Producto</TableHead>
            <TableHead className="normal-case tracking-normal">Categoria</TableHead>
            <TableHead className="normal-case tracking-normal">Proveedor</TableHead>
            <TableHead className="normal-case tracking-normal">Costo</TableHead>
            <TableHead className="normal-case tracking-normal">Detal</TableHead>
            <TableHead className="normal-case tracking-normal">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pagedProducts.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="py-8 text-center text-slate-500">
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
                <TableCell className="text-sm text-slate-600">{product.categoryName ?? "Sin categoria"}</TableCell>
                <TableCell className="text-sm text-slate-600">{product.supplierName ?? "Sin proveedor"}</TableCell>
                <TableCell className="text-sm font-medium text-slate-700">
                  {formatMoney(product.baseCost, currency)}
                </TableCell>
                <TableCell className="text-sm font-medium text-slate-700">
                  {formatMoney(product.price, currency)}
                </TableCell>
                <TableCell>
                  <form id={`delete-product-${product.id}`} action={adminDeleteProductAction}>
                    <input type="hidden" name="productId" value={product.id} />
                  </form>
                  <div className="flex items-center gap-1">
                    <Button asChild type="button" variant="ghost" size="icon" className="h-8 w-8">
                      <Link href={`/admin/productos/${product.id}`} aria-label={`Editar ${product.name}`}>
                        <Edit3 className="h-4 w-4 text-slate-600" />
                      </Link>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-600 hover:text-red-700"
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
