"use client";

import Link from "next/link";
import * as React from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Boxes,
  CircleDollarSign,
  Edit3,
  LayoutGrid,
  List,
  MoreHorizontal,
  Paintbrush,
  Search,
  Tag,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import { adminDeleteProductAction } from "@/app/actions/product-actions";
import { ProductThumb } from "@/components/admin/product-thumb";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { cn } from "@/lib/utils";

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
  minRetailMarginPct?: number;
  minWholesaleMarginPct?: number;
  onOpenProduct?: (productId: string) => void;
};

type PriceMode = "detal" | "mayor";

type SortKey = "producto" | "categoria" | "proveedor" | "costo" | "detal" | "margen" | "acciones";
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
  icon,
}: {
  children: React.ReactNode;
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant={"ghost"}
      onClick={onClick}
      aria-label={`Ordenar por ${String(children)}`}
    >
      <span className="text-slate-500">{icon}</span>
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
    </Button>
  );
}

export function ProductsDataTable({
  products,
  currency,
  minRetailMarginPct = 0,
  minWholesaleMarginPct = 0,
  onOpenProduct,
}: ProductsDataTableProps) {
  const [query, setQuery] = React.useState("");
  const [categoryFilter, setCategoryFilter] = React.useState("__all__");
  const [sortKey, setSortKey] = React.useState<SortKey>("producto");
  const [sortDirection, setSortDirection] = React.useState<SortDirection>("asc");
  const [page, setPage] = React.useState(1);
  const [belowRuleOnly, setBelowRuleOnly] = React.useState(false);
  const [priceMode, setPriceMode] = React.useState<PriceMode>("detal");
  const [pendingDelete, setPendingDelete] = React.useState<{ id: string; name: string } | null>(null);

  const getActivePrice = React.useCallback(
    (product: ProductRow) => (priceMode === "mayor" ? product.wholesalePrice : product.price),
    [priceMode],
  );

  const activeMinMargin = priceMode === "mayor" ? minWholesaleMarginPct : minRetailMarginPct;

  const isBelowRule = React.useCallback(
    (product: ProductRow) => {
      const price = getActivePrice(product);
      const marginPct = price > 0 ? ((price - product.baseCost) / price) * 100 : 0;
      return marginPct < activeMinMargin;
    },
    [getActivePrice, activeMinMargin],
  );

  const belowRuleCount = React.useMemo(
    () => products.filter(isBelowRule).length,
    [products, isBelowRule],
  );

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
      const ruleMatches = !belowRuleOnly || isBelowRule(product);

      return queryMatches && categoryMatches && ruleMatches;
    });
  }, [products, query, categoryFilter, belowRuleOnly, isBelowRule]);

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
          return (getActivePrice(a) - getActivePrice(b)) * directionFactor;
        case "margen":
          return (
            (getActivePrice(a) - a.baseCost - (getActivePrice(b) - b.baseCost)) * directionFactor
          );
        default:
          return 0;
      }
    });

    return list;
  }, [filteredProducts, sortKey, sortDirection, getActivePrice]);

  const totalPages = Math.max(1, Math.ceil(sortedProducts.length / PAGE_SIZE));

  React.useEffect(() => {
    setPage(1);
  }, [query, categoryFilter, belowRuleOnly]);

  React.useEffect(() => {
    if (belowRuleOnly && belowRuleCount === 0) {
      setBelowRuleOnly(false);
    }
  }, [belowRuleOnly, belowRuleCount]);

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

  const confirmDelete = () => {
    if (!pendingDelete) {
      return;
    }
    const forms = document.querySelectorAll<HTMLFormElement>(
      `form[data-delete-product-id="${pendingDelete.id}"]`,
    );
    const form =
      Array.from(forms).find((candidate) => candidate.offsetParent !== null) ??
      forms[0] ??
      null;
    form?.requestSubmit();
    setPendingDelete(null);
  };

  const [viewMode, setViewMode] = React.useState<"grid" | "table">("grid");

  const handleOpenProduct = (
    event: React.MouseEvent<HTMLAnchorElement>,
    productId: string,
  ) => {
    if (!onOpenProduct) {
      return;
    }
    event.preventDefault();
    onOpenProduct(productId);
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
            <Button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              aria-label="Limpiar busqueda"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
        {belowRuleCount > 0 ? (
          <Button
            type="button"
            variant={belowRuleOnly ? "secondary" : "outline"}
            onClick={() => setBelowRuleOnly((value) => !value)}
            className={cn(
              "h-9 shrink-0 gap-1.5 border-red-200 text-sm font-medium text-red-600 hover:bg-red-50 hover:text-red-700",
              belowRuleOnly && "bg-red-50 text-red-700",
            )}
            aria-pressed={belowRuleOnly}
            title="Productos por debajo del margen minimo"
          >
            <AlertTriangle className="h-4 w-4" />
            {belowRuleCount}
          </Button>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 lg:ml-auto lg:justify-end">
          <select
            value={priceMode}
            onChange={(event) => setPriceMode(event.target.value as PriceMode)}
            className="h-9 w-full rounded-lg border border-[var(--line)] bg-white px-2.5 text-sm text-slate-700 outline-none transition focus:border-[var(--line-strong)] sm:w-auto"
            aria-label="Modo de precio"
            title="Precio a mostrar"
          >
            <option value="detal">Detal</option>
            <option value="mayor">Por mayor</option>
          </select>
          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            className="h-9 w-full rounded-lg border border-[var(--line)] bg-white px-2.5 text-sm text-slate-700 outline-none transition focus:border-[var(--line-strong)] sm:min-w-40 sm:w-auto"
            aria-label="Filtrar por categoria"
          >
            <option value="__all__">Categorias</option>
            {categoryOptions.map((category) => (
              <option key={category.value} value={category.value}>
                {category.label}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => {
              setQuery("");
              setCategoryFilter("__all__");
            }}
            disabled={!query && categoryFilter === "__all__"}
            aria-label="Limpiar filtros"
            title="Limpiar filtros"
          >
            <Paintbrush className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-0.5 rounded-lg border border-[var(--line)] p-0.5">
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
        pagedProducts.length === 0 ? (
          <div className="rounded-xl border border-[var(--line)] bg-white px-3 py-6 text-center text-sm text-slate-500">
            No hay productos para el filtro actual.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {pagedProducts.map((product) => (
              <div
                key={product.id}
                className="group relative flex items-stretch overflow-hidden border border-[var(--line)] bg-white transition hover:shadow-md"
              >
                <form data-delete-product-id={product.id} action={adminDeleteProductAction}>
                  <input type="hidden" name="productId" value={product.id} />
                </form>
                <Link
                  href={`/admin/productos/${product.id}`}
                  onClick={(event) => handleOpenProduct(event, product.id)}
                  className="flex min-w-0 flex-1 items-stretch"
                >
                  <ProductThumb
                    src={product.thumbnailUrl}
                    alt={product.name}
                    className="w-14 shrink-0 self-stretch bg-slate-50 object-cover"
                  />
                  <div className="min-w-0 flex-1 p-3">
                    <p className="line-clamp-2 text-sm font-semibold text-slate-900">{product.name}</p>
                    {(() => {
                      const activePrice = getActivePrice(product);
                      const margin = activePrice - product.baseCost;
                      const marginPct = activePrice > 0 ? (margin / activePrice) * 100 : 0;
                      const belowRule = isBelowRule(product);
                      return (
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs text-slate-500">
                            {product.code ?? "Sin codigo"}
                          </span>
                          <span className={belowRule ? "shrink-0 text-[11px] font-semibold text-red-600" : "shrink-0 text-[11px] font-semibold text-emerald-600"}>
                            {formatMoney(margin, currency)} · {marginPct.toFixed(1)}%
                          </span>
                        </div>
                      );
                    })()}
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="inline-flex max-w-[55%] truncate rounded-md border border-[var(--line)] bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700">
                        {product.categoryName ?? "Sin categoria"}
                      </span>
                      <span className="text-sm font-semibold text-slate-800">
                        {formatMoney(getActivePrice(product), currency)}
                      </span>
                    </div>
                  </div>
                </Link>
                <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition group-hover:opacity-100">
                  <Button type="button" variant="outline" size="icon" className="h-7 w-7 bg-white/90">
                    <Link
                      href={`/admin/productos/${product.id}`}
                      aria-label={`Editar ${product.name}`}
                      onClick={(event) => handleOpenProduct(event, product.id)}
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-7 w-7 border-red-200 bg-white/90 text-red-600 hover:bg-red-50 hover:text-red-700"
                    onClick={() => setPendingDelete({ id: product.id, name: product.name })}
                    aria-label={`Eliminar ${product.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : null}

      <div className={viewMode === "table" ? "space-y-2 md:hidden" : "hidden"}>
        {pagedProducts.length === 0 ? (
          <div className="rounded-xl border border-[var(--line)] bg-white px-3 py-6 text-center text-sm text-slate-500">
            No hay productos para el filtro actual.
          </div>
        ) : (
          pagedProducts.map((product) => (
            <article
              key={product.id}
              className="rounded-xl border border-[var(--line)] bg-white p-3"
            >
              <form data-delete-product-id={product.id} action={adminDeleteProductAction}>
                <input type="hidden" name="productId" value={product.id} />
              </form>
              <div className="grid grid-cols-[3rem_minmax(0,1fr)_auto] items-start gap-2">
                <Link
                  href={`/admin/productos/${product.id}`}
                  className="group col-span-2 grid grid-cols-[3rem_minmax(0,1fr)] items-start gap-2 rounded-md transition"
                  onClick={(event) => handleOpenProduct(event, product.id)}
                >
                  <ProductThumb
                    src={product.thumbnailUrl}
                    alt={product.name}
                    className="h-12 w-12 rounded-md border border-[var(--line)] object-cover"
                  />
                  <div className="min-w-0">
                    <p className="line-clamp-2 break-words text-sm font-semibold text-slate-900">{product.name}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2">
                      <span className="inline-flex rounded-md border border-[var(--line)] bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700">
                        {product.categoryName ?? "Sin categoria"}
                      </span>
                      <span className="text-[11px] leading-none font-semibold text-slate-700">
                        {formatMoney(product.baseCost, currency)}
                      </span>
                    </div>
                  </div>
                </Link>
                <div className="flex flex-col gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                  >
                    <Link
                      href={`/admin/productos/${product.id}`}
                      aria-label={`Editar ${product.name}`}
                      onClick={(event) => handleOpenProduct(event, product.id)}
                    >
                      <Edit3 className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                    onClick={() => setPendingDelete({ id: product.id, name: product.name })}
                    aria-label={`Eliminar ${product.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </article>
          ))
        )}
      </div>

      <div className={viewMode === "table" ? "hidden overflow-hidden rounded-xl border border-[var(--line)] bg-white md:block" : "hidden"}>
        <Table className="min-w-[980px]">
          <TableHeader>
            <TableRow className="bg-slate-50/70 hover:bg-slate-50/70">
              <TableHead className="normal-case tracking-normal">
                <HeaderLabel
                  active={sortKey === "producto"}
                  direction={sortDirection}
                  onClick={() => toggleSort("producto")}
                  icon={<Boxes className="h-3.5 w-3.5" />}
                >
                  Producto
                </HeaderLabel>
              </TableHead>
              <TableHead className="normal-case tracking-normal">
                <HeaderLabel
                  active={sortKey === "categoria"}
                  direction={sortDirection}
                  onClick={() => toggleSort("categoria")}
                  icon={<Tag className="h-3.5 w-3.5" />}
                >
                  Categoria
                </HeaderLabel>
              </TableHead>
              <TableHead className="normal-case tracking-normal">
                <HeaderLabel
                  active={sortKey === "costo"}
                  direction={sortDirection}
                  onClick={() => toggleSort("costo")}
                  icon={<CircleDollarSign className="h-3.5 w-3.5" />}
                >
                  Costo
                </HeaderLabel>
              </TableHead>
              <TableHead className="normal-case tracking-normal">
                <HeaderLabel
                  active={sortKey === "detal"}
                  direction={sortDirection}
                  onClick={() => toggleSort("detal")}
                  icon={<CircleDollarSign className="h-3.5 w-3.5" />}
                >
                  {priceMode === "mayor" ? "Precio mayor" : "Precio"}
                </HeaderLabel>
              </TableHead>
              <TableHead className="normal-case tracking-normal">
                <HeaderLabel
                  active={sortKey === "margen"}
                  direction={sortDirection}
                  onClick={() => toggleSort("margen")}
                  icon={<TrendingUp className="h-3.5 w-3.5" />}
                >
                  Margen
                </HeaderLabel>
              </TableHead>
              <TableHead className="normal-case tracking-normal">
                <span className="sr-only">Acciones</span>
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
                <TableRow key={product.id} className="[&_td]:py-1.5">
                  <TableCell>
                    <Link
                      href={`/admin/productos/${product.id}`}
                      className="group -m-1 flex items-center gap-2.5 rounded-md p-1 transition hover:bg-slate-50"
                      onClick={(event) => handleOpenProduct(event, product.id)}
                    >
                      <ProductThumb
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
                  <TableCell className="text-sm font-medium text-slate-700">
                    {formatMoney(product.baseCost, currency)}
                  </TableCell>
                  <TableCell className="text-sm font-semibold text-slate-800">
                    {formatMoney(getActivePrice(product), currency)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {(() => {
                      const activePrice = getActivePrice(product);
                      const margin = activePrice - product.baseCost;
                      const marginPct = activePrice > 0 ? (margin / activePrice) * 100 : 0;
                      const belowRule = isBelowRule(product);
                      return (
                        <div className="flex flex-col">
                          <span className={belowRule ? "font-medium text-red-600" : "font-medium text-emerald-600"}>
                            {formatMoney(margin, currency)}
                          </span>
                          <span className={belowRule ? "text-xs font-medium text-red-600" : "text-xs text-slate-500"}>
                            {marginPct.toFixed(1)}%
                          </span>
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell>
                    <form data-delete-product-id={product.id} action={adminDeleteProductAction}>
                      <input type="hidden" name="productId" value={product.id} />
                    </form>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 border border-transparent hover:border-[var(--line)]"
                          aria-label={`Acciones de ${product.name}`}
                        >
                          <MoreHorizontal className="h-4 w-4 text-slate-600" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild className="gap-2">
                          <Link
                            href={`/admin/productos/${product.id}`}
                            onClick={(event) => handleOpenProduct(event, product.id)}
                          >
                            <Edit3 className="h-4 w-4" />
                            Editar
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="gap-2 text-red-600 focus:text-red-700"
                          onSelect={() => setPendingDelete({ id: product.id, name: product.name })}
                        >
                          <Trash2 className="h-4 w-4" />
                          Eliminar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-500">
          Mostrando {rangeStart}-{rangeEnd} de {filteredProducts.length}
        </p>
        <div className="flex items-center gap-2 self-end sm:self-auto">
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

      {pendingDelete ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#11182752] px-4"
          role="dialog"
          aria-modal="true"
          aria-label="Confirmar eliminacion"
          onClick={() => setPendingDelete(null)}
        >
          <div
            className="saas-card w-full max-w-md rounded-xl p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-slate-900">Eliminar producto</h3>
              <p className="text-sm text-slate-600">
                Se eliminara <span className="font-medium text-slate-800">{pendingDelete.name}</span>. Esta accion no se puede deshacer.
              </p>
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPendingDelete(null)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                className="bg-red-600 text-white hover:bg-red-700"
                onClick={confirmDelete}
              >
                Eliminar
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
