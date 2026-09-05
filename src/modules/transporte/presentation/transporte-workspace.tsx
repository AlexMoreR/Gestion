"use client";

import * as React from "react";
import {
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  MapPin,
  Search,
  Truck,
  X,
} from "lucide-react";
import { StatList } from "@/components/ui/stat-list";
import { Input } from "@/components/ui/input";
import type {
  TransportCityRow,
  TransportDepartmentSummary,
  TransportLocalityRow,
  TransportMetrics,
  TransportSearchResult,
} from "@/modules/transporte/domain/entities";
import {
  adminGetCityLocalitiesAction,
  adminGetDepartmentCitiesAction,
  adminSearchTransportAction,
  adminToggleCityFreeShippingAction,
  adminToggleLocalityFreeShippingAction,
} from "@/app/actions/transporte-actions";

type TransporteWorkspaceProps = {
  metrics: TransportMetrics;
  departments: TransportDepartmentSummary[];
};

// Boton-pastilla que marca/desmarca envio gratis para un lugar.
function FreeToggle({
  free,
  pending,
  onToggle,
}: {
  free: boolean;
  pending: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={pending}
      aria-pressed={free}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-60 ${
        free
          ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          : "border-border bg-muted/40 text-muted-foreground hover:bg-muted"
      }`}
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : free ? (
        <Check className="h-3.5 w-3.5" />
      ) : (
        <Truck className="h-3.5 w-3.5" />
      )}
      {free ? "Envio gratis" : "Marcar gratis"}
    </button>
  );
}

export function TransporteWorkspace({ metrics: initialMetrics, departments: initialDepartments }: TransporteWorkspaceProps) {
  const [metrics, setMetrics] = React.useState(initialMetrics);
  const [departments, setDepartments] = React.useState(initialDepartments);

  // Arbol perezoso: ciudades por departamento y corregimientos por ciudad.
  const [expandedDept, setExpandedDept] = React.useState<Set<string>>(new Set());
  const [citiesByDept, setCitiesByDept] = React.useState<Record<string, TransportCityRow[]>>({});
  const [loadingDept, setLoadingDept] = React.useState<Set<string>>(new Set());

  const [expandedCity, setExpandedCity] = React.useState<Set<string>>(new Set());
  const [localitiesByCity, setLocalitiesByCity] = React.useState<Record<string, TransportLocalityRow[]>>({});
  const [loadingCity, setLoadingCity] = React.useState<Set<string>>(new Set());

  const [pendingIds, setPendingIds] = React.useState<Set<string>>(new Set());
  const [error, setError] = React.useState<string | null>(null);

  // Busqueda
  const [search, setSearch] = React.useState("");
  const [searchResults, setSearchResults] = React.useState<TransportSearchResult[] | null>(null);
  const [searching, setSearching] = React.useState(false);

  function withPending(id: string, on: boolean) {
    setPendingIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function toggleDept(dept: TransportDepartmentSummary) {
    setExpandedDept((prev) => {
      const next = new Set(prev);
      if (next.has(dept.id)) next.delete(dept.id);
      else next.add(dept.id);
      return next;
    });
    if (!citiesByDept[dept.id] && !loadingDept.has(dept.id)) {
      setLoadingDept((prev) => new Set(prev).add(dept.id));
      const cities = await adminGetDepartmentCitiesAction(dept.id);
      setCitiesByDept((prev) => ({ ...prev, [dept.id]: cities }));
      setLoadingDept((prev) => {
        const next = new Set(prev);
        next.delete(dept.id);
        return next;
      });
    }
  }

  async function toggleCityExpand(city: TransportCityRow) {
    if (city.localityCount === 0) return;
    setExpandedCity((prev) => {
      const next = new Set(prev);
      if (next.has(city.id)) next.delete(city.id);
      else next.add(city.id);
      return next;
    });
    if (!localitiesByCity[city.id] && !loadingCity.has(city.id)) {
      setLoadingCity((prev) => new Set(prev).add(city.id));
      const localities = await adminGetCityLocalitiesAction(city.id);
      setLocalitiesByCity((prev) => ({ ...prev, [city.id]: localities }));
      setLoadingCity((prev) => {
        const next = new Set(prev);
        next.delete(city.id);
        return next;
      });
    }
  }

  async function onToggleCity(departmentId: string, city: TransportCityRow) {
    const nextValue = !city.freeShipping;
    withPending(city.id, true);
    setError(null);

    // Optimista: fila, contador del departamento y metrica global.
    setCitiesByDept((prev) => ({
      ...prev,
      [departmentId]: (prev[departmentId] ?? []).map((row) =>
        row.id === city.id ? { ...row, freeShipping: nextValue } : row,
      ),
    }));
    setDepartments((prev) =>
      prev.map((dept) =>
        dept.id === departmentId
          ? { ...dept, freeCityCount: dept.freeCityCount + (nextValue ? 1 : -1) }
          : dept,
      ),
    );
    setMetrics((prev) => ({ ...prev, freeCityCount: prev.freeCityCount + (nextValue ? 1 : -1) }));

    const result = await adminToggleCityFreeShippingAction(city.id, nextValue);
    withPending(city.id, false);
    if (!result.ok) {
      // Revertir
      setCitiesByDept((prev) => ({
        ...prev,
        [departmentId]: (prev[departmentId] ?? []).map((row) =>
          row.id === city.id ? { ...row, freeShipping: !nextValue } : row,
        ),
      }));
      setDepartments((prev) =>
        prev.map((dept) =>
          dept.id === departmentId
            ? { ...dept, freeCityCount: dept.freeCityCount + (nextValue ? -1 : 1) }
            : dept,
        ),
      );
      setMetrics((prev) => ({ ...prev, freeCityCount: prev.freeCityCount + (nextValue ? -1 : 1) }));
      setError(result.error ?? "No se pudo guardar el cambio");
    }
  }

  async function onToggleLocality(cityId: string, locality: TransportLocalityRow) {
    const nextValue = !locality.freeShipping;
    withPending(locality.id, true);
    setError(null);

    setLocalitiesByCity((prev) => ({
      ...prev,
      [cityId]: (prev[cityId] ?? []).map((row) =>
        row.id === locality.id ? { ...row, freeShipping: nextValue } : row,
      ),
    }));
    setMetrics((prev) => ({ ...prev, freeLocalityCount: prev.freeLocalityCount + (nextValue ? 1 : -1) }));

    const result = await adminToggleLocalityFreeShippingAction(locality.id, nextValue);
    withPending(locality.id, false);
    if (!result.ok) {
      setLocalitiesByCity((prev) => ({
        ...prev,
        [cityId]: (prev[cityId] ?? []).map((row) =>
          row.id === locality.id ? { ...row, freeShipping: !nextValue } : row,
        ),
      }));
      setMetrics((prev) => ({ ...prev, freeLocalityCount: prev.freeLocalityCount + (nextValue ? -1 : 1) }));
      setError(result.error ?? "No se pudo guardar el cambio");
    }
  }

  // Busqueda con debounce sencillo.
  React.useEffect(() => {
    const term = search.trim();
    if (term.length < 2) {
      setSearchResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const handle = setTimeout(async () => {
      const results = await adminSearchTransportAction(term);
      setSearchResults(results);
      setSearching(false);
    }, 350);
    return () => clearTimeout(handle);
  }, [search]);

  async function onToggleSearchResult(result: TransportSearchResult) {
    const nextValue = !result.freeShipping;
    withPending(result.id, true);
    setError(null);
    setSearchResults((prev) =>
      (prev ?? []).map((row) => (row.id === result.id ? { ...row, freeShipping: nextValue } : row)),
    );
    setMetrics((prev) =>
      result.kind === "city"
        ? { ...prev, freeCityCount: prev.freeCityCount + (nextValue ? 1 : -1) }
        : { ...prev, freeLocalityCount: prev.freeLocalityCount + (nextValue ? 1 : -1) },
    );

    const action =
      result.kind === "city"
        ? adminToggleCityFreeShippingAction(result.id, nextValue)
        : adminToggleLocalityFreeShippingAction(result.id, nextValue);
    const res = await action;
    withPending(result.id, false);
    if (!res.ok) {
      setSearchResults((prev) =>
        (prev ?? []).map((row) => (row.id === result.id ? { ...row, freeShipping: !nextValue } : row)),
      );
      setMetrics((prev) =>
        result.kind === "city"
          ? { ...prev, freeCityCount: prev.freeCityCount + (nextValue ? -1 : 1) }
          : { ...prev, freeLocalityCount: prev.freeLocalityCount + (nextValue ? -1 : 1) },
      );
      setError(res.error ?? "No se pudo guardar el cambio");
    }
  }

  const showingSearch = search.trim().length >= 2;

  return (
    <section className="space-y-4">
      <StatList
        items={[
          {
            label: "Ciudades con envio gratis",
            value: `${metrics.freeCityCount}`,
            helper: "Municipios marcados",
            icon: Building2,
            tone: "info",
          },
          {
            label: "Corregimientos con envio gratis",
            value: `${metrics.freeLocalityCount}`,
            helper: "Centros poblados marcados",
            icon: MapPin,
            tone: "info",
          },
          {
            label: "Departamentos",
            value: `${departments.length}`,
            helper: "Cobertura nacional (DANE)",
            icon: Truck,
          },
        ]}
      />

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar ciudad o corregimiento..."
          className="pl-9 pr-9"
          aria-label="Buscar ciudad o corregimiento"
        />
        {search ? (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Limpiar busqueda"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {showingSearch ? (
        <div className="rounded-xl border border-border bg-card">
          {searching ? (
            <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Buscando...
            </p>
          ) : (searchResults?.length ?? 0) === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Sin resultados para “{search.trim()}”.</p>
          ) : (
            <ul className="divide-y divide-border">
              {searchResults!.map((result) => (
                <li key={`${result.kind}-${result.id}`} className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground">
                      {result.kind === "city" ? (
                        <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      ) : (
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                      {result.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {result.kind === "city"
                        ? result.departmentName
                        : `${result.cityName}, ${result.departmentName}`}
                    </p>
                  </div>
                  <FreeToggle
                    free={result.freeShipping}
                    pending={pendingIds.has(result.id)}
                    onToggle={() => onToggleSearchResult(result)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {departments.map((dept) => {
            const open = expandedDept.has(dept.id);
            const cities = citiesByDept[dept.id];
            return (
              <div key={dept.id} className="overflow-hidden rounded-xl border border-border bg-card">
                <button
                  type="button"
                  onClick={() => toggleDept(dept)}
                  className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/50"
                >
                  {open ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{dept.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {dept.freeCityCount > 0 ? (
                      <span className="font-medium text-emerald-600">{dept.freeCityCount} gratis</span>
                    ) : null}{" "}
                    <span>· {dept.cityCount} ciudades</span>
                  </span>
                </button>

                {open ? (
                  <div className="border-t border-border">
                    {loadingDept.has(dept.id) || !cities ? (
                      <p className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" /> Cargando ciudades...
                      </p>
                    ) : (
                      <ul className="divide-y divide-border">
                        {cities.map((city) => {
                          const cityOpen = expandedCity.has(city.id);
                          const localities = localitiesByCity[city.id];
                          return (
                            <li key={city.id}>
                              <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                                <button
                                  type="button"
                                  onClick={() => toggleCityExpand(city)}
                                  className={`flex min-w-0 flex-1 items-center gap-1.5 text-left ${
                                    city.localityCount > 0 ? "cursor-pointer" : "cursor-default"
                                  }`}
                                >
                                  {city.localityCount > 0 ? (
                                    cityOpen ? (
                                      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                    ) : (
                                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                    )
                                  ) : (
                                    <span className="w-3.5 shrink-0" />
                                  )}
                                  <span className="min-w-0 truncate text-sm text-foreground">{city.name}</span>
                                  {city.localityCount > 0 ? (
                                    <span className="shrink-0 text-xs text-muted-foreground">
                                      ({city.freeLocalityCount > 0 ? `${city.freeLocalityCount}/` : ""}
                                      {city.localityCount} corr.)
                                    </span>
                                  ) : null}
                                </button>
                                <FreeToggle
                                  free={city.freeShipping}
                                  pending={pendingIds.has(city.id)}
                                  onToggle={() => onToggleCity(dept.id, city)}
                                />
                              </div>

                              {cityOpen ? (
                                <div className="bg-muted/30">
                                  {loadingCity.has(city.id) || !localities ? (
                                    <p className="flex items-center gap-2 px-4 py-2.5 pl-10 text-xs text-muted-foreground">
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando corregimientos...
                                    </p>
                                  ) : (
                                    <ul className="divide-y divide-border/60">
                                      {localities.map((locality) => (
                                        <li
                                          key={locality.id}
                                          className="flex items-center justify-between gap-3 px-4 py-2 pl-10"
                                        >
                                          <span className="min-w-0 truncate text-sm text-muted-foreground">
                                            {locality.name}
                                          </span>
                                          <FreeToggle
                                            free={locality.freeShipping}
                                            pending={pendingIds.has(locality.id)}
                                            onToggle={() => onToggleLocality(city.id, locality)}
                                          />
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
