"use client";

import * as React from "react";
import { Search, Tags, X } from "lucide-react";
import { ProductThumb } from "@/components/admin/product-thumb";
import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";

export type WholesaleProduct = {
  id: string;
  name: string;
  code: string | null;
  categoryName: string | null;
  thumbnailUrl: string;
  wholesalePrice: number;
  minWholesaleQty: number;
};

type WholesaleCatalogProps = {
  products: WholesaleProduct[];
  categories: string[];
  currency: SupportedCurrencyCode;
};

const DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");

function normalizeText(value: string): string {
  return value.normalize("NFD").replace(DIACRITICS, "").toLowerCase().trim();
}

export function WholesaleCatalog({ products, categories, currency }: WholesaleCatalogProps) {
  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState("__all__");

  const filtered = React.useMemo(() => {
    const normalizedQuery = normalizeText(query);
    return products.filter((product) => {
      const haystack = normalizeText(
        [product.name, product.code ?? "", product.categoryName ?? ""].join(" "),
      );
      const queryMatches = !normalizedQuery || haystack.includes(normalizedQuery);
      const categoryMatches =
        category === "__all__" || (product.categoryName ?? "Sin categoría") === category;
      return queryMatches && categoryMatches;
    });
  }, [products, query, category]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative w-full flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nombre, código o categoría"
            className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-9 text-sm outline-none transition focus:border-slate-400"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              aria-label="Limpiar búsqueda"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
        <div className="relative w-full sm:w-64">
          <Tags className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none transition focus:border-slate-400"
            aria-label="Filtrar por categoría"
          >
            <option value="__all__">Todas las categorías</option>
            {categories.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="text-xs text-slate-500">
        {filtered.length} producto{filtered.length === 1 ? "" : "s"}
      </p>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-12 text-center text-sm text-slate-500">
          No encontramos productos para tu búsqueda.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((product) => (
            <article
              key={product.id}
              className="flex overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:shadow-md"
            >
              <ProductThumb
                src={product.thumbnailUrl}
                alt={product.name}
                className="h-28 w-28 shrink-0 self-stretch bg-slate-50 object-cover"
              />
              <div className="flex min-w-0 flex-1 flex-col justify-between p-3">
                <div className="min-w-0">
                  <p className="line-clamp-2 text-sm font-semibold text-slate-900">{product.name}</p>
                  {product.code ? (
                    <p className="truncate text-xs text-slate-400">{product.code}</p>
                  ) : null}
                  {product.categoryName ? (
                    <span className="mt-1 inline-flex max-w-full truncate rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600">
                      {product.categoryName}
                    </span>
                  ) : null}
                </div>
                <div className="mt-2">
                  <p className="text-lg font-bold text-slate-900">
                    {formatMoney(product.wholesalePrice, currency)}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Precio x mayor · desde {product.minWholesaleQty} und.
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
