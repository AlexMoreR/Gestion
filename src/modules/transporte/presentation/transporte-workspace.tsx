"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import {
  AlertCircle,
  Building2,
  ChevronDown,
  ChevronRight,
  List,
  Loader2,
  Map as MapIcon,
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
  TransportPendingPlace,
  TransportSearchResult,
} from "@/modules/transporte/domain/entities";
import { resolveShippingType, type ShippingTypeName } from "@/modules/transporte/domain/shipping";
import {
  adminGetCityLocalitiesAction,
  adminGetDepartmentCitiesAction,
  adminSearchTransportAction,
  adminSetPlaceShippingTypeAction,
} from "@/app/actions/transporte-actions";
import { ShippingTypeControl, type PlaceKind, type ShippingFields } from "./shipping-type-control";

// El mapa (y su JSON de formas) solo se baja al tocar "Mapa".
const TransporteMap = dynamic(() => import("./transporte-map").then((mod) => mod.TransporteMap), {
  ssr: false,
  loading: () => (
    <p className="flex items-center gap-2 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Cargando mapa...
    </p>
  ),
});

type TransporteWorkspaceProps = {
  metrics: TransportMetrics;
  departments: TransportDepartmentSummary[];
  pending: TransportPendingPlace[];
};

// Aplica un tipo nuevo a una fila (mismo criterio que el servidor: freeShipping se sincroniza
// solo cuando hay tipo; "Automatico" deja freeShipping como estaba).
function applyShippingType<T extends ShippingFields & { freeShipping: boolean }>(
  row: T,
  shippingType: ShippingTypeName | null,
  parent?: { shippingType: ShippingTypeName | null; freeShipping: boolean } | null,
): T {
  const freeShipping = shippingType == null ? row.freeShipping : shippingType === "GRATIS";
  return {
    ...row,
    shippingType,
    freeShipping,
    needsReview: false,
    effectiveShippingType: resolveShippingType({ shippingType, freeShipping, parent }),
  };
}

export function TransporteWorkspace({
  metrics: initialMetrics,
  departments: initialDepartments,
  pending: initialPending,
}: TransporteWorkspaceProps) {
  const [metrics, setMetrics] = React.useState(initialMetrics);
  const [departments, setDepartments] = React.useState(initialDepartments);
  const [pendingPlaces, setPendingPlaces] = React.useState(initialPending);

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

  // Guarda en el servidor y, si sale bien, refleja el cambio en todas las vistas cargadas.
  async function savePlaceType(params: {
    kind: PlaceKind;
    id: string;
    shippingType: ShippingTypeName | null;
    wasFree: boolean;
    wasPendingReview: boolean;
    departmentId?: string | null;
  }): Promise<boolean> {
    const { kind, id, shippingType, wasFree, wasPendingReview, departmentId } = params;
    withPending(id, true);
    setError(null);
    const result = await adminSetPlaceShippingTypeAction(kind, id, shippingType);
    withPending(id, false);
    if (!result.ok) {
      setError(result.error ?? "No se pudo guardar el cambio");
      return false;
    }

    const nowFree = shippingType == null ? wasFree : shippingType === "GRATIS";
    const freeDelta = nowFree === wasFree ? 0 : nowFree ? 1 : -1;

    setMetrics((prev) => ({
      ...prev,
      freeCityCount: prev.freeCityCount + (kind === "city" ? freeDelta : 0),
      freeLocalityCount: prev.freeLocalityCount + (kind === "locality" ? freeDelta : 0),
      pendingReviewCount: Math.max(0, prev.pendingReviewCount - (wasPendingReview ? 1 : 0)),
    }));

    if (kind === "city") {
      setCitiesByDept((prev) => {
        const next: Record<string, TransportCityRow[]> = {};
        for (const [depId, rows] of Object.entries(prev)) {
          next[depId] = rows.map((row) => (row.id === id ? applyShippingType(row, shippingType) : row));
        }
        return next;
      });
      if (freeDelta !== 0 && departmentId) {
        setDepartments((prev) =>
          prev.map((dept) => (dept.id === departmentId ? { ...dept, freeCityCount: dept.freeCityCount + freeDelta } : dept)),
        );
      }
      // Los corregimientos sin tipo propio heredan el de la ciudad.
      setLocalitiesByCity((prev) => {
        const rows = prev[id];
        if (!rows) return prev;
        const parentFree = shippingType == null ? wasFree : shippingType === "GRATIS";
        const parent = { shippingType, freeShipping: parentFree };
        return {
          ...prev,
          [id]: rows.map((row) =>
            row.shippingType
              ? row
              : {
                  ...row,
                  effectiveShippingType: resolveShippingType({ shippingType: null, freeShipping: row.freeShipping, parent }),
                },
          ),
        };
      });
    } else {
      setLocalitiesByCity((prev) => {
        const next: Record<string, TransportLocalityRow[]> = {};
        for (const [cityId, rows] of Object.entries(prev)) {
          const parentCity = Object.values(citiesByDept)
            .flat()
            .find((city) => city.id === cityId);
          next[cityId] = rows.map((row) =>
            row.id === id
              ? applyShippingType(
                  row,
                  shippingType,
                  parentCity ? { shippingType: parentCity.shippingType, freeShipping: parentCity.freeShipping } : null,
                )
              : row,
          );
        }
        return next;
      });
    }

    setPendingPlaces((prev) => prev.filter((place) => place.id !== id));

    // Los resultados de busqueda se vuelven a pedir para mostrar el tipo efectivo exacto.
    const term = search.trim();
    if (term.length >= 2) {
      const results = await adminSearchTransportAction(term);
      setSearchResults(results);
    }
    return true;
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

  const showingSearch = search.trim().length >= 2;
  const [view, setView] = React.useState<"lista" | "mapa">("lista");

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
            label: "Pendientes de revisar",
            value: `${metrics.pendingReviewCount}`,
            helper: "Llegaron desde el CRM",
            icon: AlertCircle,
          },
          {
            label: "Departamentos",
            value: `${departments.length}`,
            helper: "Cobertura nacional (DANE)",
            icon: Truck,
          },
        ]}
      />

      <div className="inline-flex rounded-lg border border-border bg-card p-0.5" role="group" aria-label="Vista">
        {(["lista", "mapa"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setView(option)}
            aria-pressed={view === option}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              view === option ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {option === "lista" ? <List className="h-4 w-4" /> : <MapIcon className="h-4 w-4" />}
            {option === "lista" ? "Lista" : "Mapa"}
          </button>
        ))}
      </div>

      {error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {view === "mapa" ? (
        <TransporteMap
          // Misma funcion de guardar de la lista: la lista queda al dia al volver.
          onSave={(kind, id, shippingType, wasFree, departmentName) =>
            savePlaceType({
              kind,
              id,
              shippingType,
              wasFree,
              wasPendingReview: pendingPlaces.some((place) => place.id === id),
              departmentId:
                kind === "city" ? departments.find((dept) => dept.name === departmentName)?.id ?? null : null,
            })
          }
        />
      ) : (
        <>
      <p className="text-xs text-muted-foreground">
        Tipos: <strong>Gratis</strong> (sin costo), <strong>Adicional</strong> (se suma el envio adicional del
        producto o su categoria), <strong>Se cotiza</strong> y <strong>No llegamos</strong>. &quot;Automatico&quot; usa
        lo de antes: el de la ciudad si es un corregimiento, o envio gratis si esta marcado.{" "}
        <strong>Contraentrega $</strong>: envio del combo de camillas pagando al recibir; vacio = se cotiza (un
        corregimiento vacio usa el de su ciudad). No aplica en &quot;No llegamos&quot;.
      </p>

      {pendingPlaces.length > 0 ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50/40">
          <p className="flex items-center gap-2 border-b border-amber-200 px-4 py-3 text-sm font-semibold text-foreground">
            <AlertCircle className="h-4 w-4 text-amber-600" /> Pendientes de revisar ({pendingPlaces.length})
          </p>
          <ul className="divide-y divide-amber-200/60">
            {pendingPlaces.map((place) => (
              <li key={`${place.kind}-${place.id}`} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground">
                    {place.kind === "city" ? (
                      <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    )}
                    {place.name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {place.cityName ? `${place.cityName}, ${place.departmentName}` : place.departmentName} · Origen:{" "}
                    {place.source} · {new Date(place.createdAt).toLocaleDateString("es-CO")}
                  </p>
                </div>
                <ShippingTypeControl
                  kind={place.kind}
                  id={place.id}
                  place={{ ...place, needsReview: true }}
                  pending={pendingIds.has(place.id)}
                  onChange={(next) =>
                    savePlaceType({
                      kind: place.kind,
                      id: place.id,
                      shippingType: next,
                      wasFree: place.freeShipping,
                      wasPendingReview: true,
                    })
                  }
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

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
                <li key={`${result.kind}-${result.id}`} className="flex flex-wrap items-center justify-between gap-3 p-3">
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
                  <ShippingTypeControl
                    kind={result.kind}
                    id={result.id}
                    place={result}
                    pending={pendingIds.has(result.id)}
                    onChange={(next) =>
                      savePlaceType({
                        kind: result.kind,
                        id: result.id,
                        shippingType: next,
                        wasFree: result.freeShipping,
                        wasPendingReview: result.needsReview,
                        departmentId:
                          result.kind === "city"
                            ? departments.find((dept) => dept.name === result.departmentName)?.id ?? null
                            : null,
                      })
                    }
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
                              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
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
                                <ShippingTypeControl
                                  kind="city"
                                  id={city.id}
                                  place={city}
                                  pending={pendingIds.has(city.id)}
                                  onChange={(next) =>
                                    savePlaceType({
                                      kind: "city",
                                      id: city.id,
                                      shippingType: next,
                                      wasFree: city.freeShipping,
                                      wasPendingReview: city.needsReview,
                                      departmentId: dept.id,
                                    })
                                  }
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
                                          className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 pl-10"
                                        >
                                          <span className="min-w-0 truncate text-sm text-muted-foreground">
                                            {locality.name}
                                          </span>
                                          <ShippingTypeControl
                                            kind="locality"
                                            id={locality.id}
                                            place={locality}
                                            pending={pendingIds.has(locality.id)}
                                            onChange={(next) =>
                                              savePlaceType({
                                                kind: "locality",
                                                id: locality.id,
                                                shippingType: next,
                                                wasFree: locality.freeShipping,
                                                wasPendingReview: locality.needsReview,
                                              })
                                            }
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
        </>
      )}
    </section>
  );
}
