import Link from "next/link";
import { Card } from "@/components/ui/card";

export default function AdminPage() {
  return (
    <section className="app-page space-y-5">
      <Card className="max-w-2xl">
        <h2 className="text-base font-semibold text-slate-900 md:text-lg">Configuracion</h2>
        <p className="mt-1 text-sm text-slate-600">
          Administra todos los usuarios, cambia roles y crea nuevas cuentas.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/admin/configuracion"
            className="inline-flex rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[var(--primary-strong)]"
          >
            Ir a configuracion
          </Link>
          <Link
            href="/admin/productos"
            className="inline-flex rounded-lg border border-[var(--line)] bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Gestionar productos
          </Link>
          <Link
            href="/admin/cotizaciones"
            className="inline-flex rounded-lg border border-[var(--line)] bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Gestionar cotizaciones
          </Link>
        </div>
      </Card>
    </section>
  );
}
