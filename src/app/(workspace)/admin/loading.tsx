import { Skeleton } from "@/components/ui/skeleton";

// Se muestra al instante al tocar un menú, pestaña o detalle del panel (Next la precarga),
// mientras llegan los datos del servidor; así nada se ve "congelado".
export default function AdminLoading() {
  return (
    <section className="w-full space-y-4" aria-busy="true" aria-label="Cargando">
      <Skeleton className="h-9 w-full max-w-md rounded-lg" />
      <Skeleton className="h-12 w-full rounded-xl" />
      <div className="flex flex-col gap-2 sm:flex-row">
        <Skeleton className="h-9 w-full rounded-lg sm:flex-1" />
        <Skeleton className="h-9 w-full rounded-lg sm:w-64" />
      </div>
      <div className="space-y-2 rounded-xl border border-border p-3">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="h-10 w-full" />
        ))}
      </div>
    </section>
  );
}
