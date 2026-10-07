"use client";

import { useRef, useState } from "react";
import { Loader2, MapPin, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CityOption } from "../domain/types";

type CityPickerProps = {
  name: string;
  search: (term: string) => Promise<CityOption[]>;
  defaultValue?: CityOption | null;
  // Ciudades a un toque (por ejemplo la actual y el destino).
  suggestions?: CityOption[];
  placeholder?: string;
  size?: "md" | "lg";
  onChange?: (city: CityOption | null) => void;
};

// Buscador de municipios (catalogo DANE). Guarda el id en un input oculto `name`.
export function CityPicker({
  name,
  search,
  defaultValue = null,
  suggestions = [],
  placeholder = "Escribe la ciudad",
  size = "md",
  onChange,
}: CityPickerProps) {
  const [selected, setSelected] = useState<CityOption | null>(defaultValue);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CityOption[]>([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<number | null>(null);
  const requestId = useRef(0);

  const choose = (city: CityOption | null) => {
    setSelected(city);
    setQuery("");
    setResults([]);
    onChange?.(city);
  };

  const handleQuery = (value: string) => {
    setQuery(value);
    if (timer.current) {
      window.clearTimeout(timer.current);
    }
    if (value.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const current = ++requestId.current;
    timer.current = window.setTimeout(async () => {
      try {
        const found = await search(value);
        if (current === requestId.current) {
          setResults(found);
        }
      } catch {
        if (current === requestId.current) {
          setResults([]);
        }
      } finally {
        if (current === requestId.current) {
          setLoading(false);
        }
      }
    }, 250);
  };

  const big = size === "lg";
  const uniqueSuggestions = suggestions.filter(
    (city, index, list) => city && list.findIndex((other) => other.id === city.id) === index && city.id !== selected?.id,
  );

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={selected?.id ?? ""} />

      {selected ? (
        <div
          className={cn(
            "flex items-center justify-between gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3",
            big ? "py-3 text-base" : "py-1.5 text-sm",
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            <MapPin className="h-4 w-4 shrink-0 text-emerald-600" />
            <span className="truncate font-medium">
              {selected.name}
              <span className="font-normal text-muted-foreground"> · {selected.departmentName}</span>
            </span>
          </span>
          <button
            type="button"
            onClick={() => choose(null)}
            className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Cambiar ciudad"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(event) => handleQuery(event.target.value)}
            placeholder={placeholder}
            autoComplete="off"
            className={cn(
              "w-full rounded-lg border border-input bg-background px-3 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
              big ? "h-12 text-base" : "h-8 text-sm",
            )}
          />
          {loading ? (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          ) : null}
          {results.length > 0 ? (
            <ul className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-border bg-popover shadow-lg">
              {results.map((city) => (
                <li key={city.id}>
                  <button
                    type="button"
                    onClick={() => choose(city)}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 text-left hover:bg-muted",
                      big ? "py-3 text-base" : "py-1.5 text-sm",
                    )}
                  >
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span>
                      {city.name}
                      <span className="text-muted-foreground"> · {city.departmentName}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}

      {uniqueSuggestions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {uniqueSuggestions.map((city) => (
            <button
              key={city.id}
              type="button"
              onClick={() => choose(city)}
              className={cn(
                "rounded-full border border-border bg-muted/50 px-3 font-medium hover:bg-muted",
                big ? "py-2 text-sm" : "py-0.5 text-xs",
              )}
            >
              {city.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
