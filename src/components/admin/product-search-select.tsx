"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

type ProductOption = {
  id: string;
  code: string | null;
  name: string;
};

type ProductSearchSelectProps = {
  products: ProductOption[];
  value: string;
  onChange: (productId: string) => void;
  placeholder?: string;
  className?: string;
  disabledIds?: Set<string>;
};

function labelFor(product: ProductOption): string {
  return `${product.code || "SIN-CODIGO"} - ${product.name}`;
}

export function ProductSearchSelect({
  products,
  value,
  onChange,
  placeholder = "Seleccionar producto",
  className,
  disabledIds,
}: ProductSearchSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const selected = products.find((product) => product.id === value) ?? null;

  const filtered = React.useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return products;
    return products.filter((product) => `${product.code ?? ""} ${product.name}`.toLowerCase().includes(term));
  }, [products, query]);

  React.useEffect(() => {
    if (!open) return;

    const handleClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  React.useEffect(() => {
    if (open) {
      setQuery("");
      // Enfoca el buscador al abrir.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex h-8 w-full items-center justify-between gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 text-left text-sm text-slate-800 outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className={cn("truncate", selected ? "" : "text-slate-400")}>
          {selected ? labelFor(selected) : placeholder}
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-400" />
      </button>

      {open ? (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-[var(--line)] bg-white shadow-lg">
          <div className="relative border-b border-[var(--line)] p-2">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar producto…"
              className="h-8 w-full rounded-md border border-[var(--line)] bg-white pl-8 pr-2 text-sm outline-none focus-visible:border-ring"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-sm text-slate-500">Sin resultados.</p>
            ) : (
              filtered.map((product) => {
                const isDisabled = Boolean(disabledIds?.has(product.id)) && product.id !== value;
                return (
                  <button
                    key={product.id}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => {
                      onChange(product.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent",
                      product.id === value ? "bg-slate-50 font-medium" : "",
                    )}
                  >
                    <Check className={cn("h-4 w-4 shrink-0", product.id === value ? "opacity-100 text-[var(--primary)]" : "opacity-0")} />
                    <span className="truncate">{labelFor(product)}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
