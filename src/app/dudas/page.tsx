import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { LogOut } from "lucide-react";

import { salirDudasAction } from "@/app/actions/dudas-actions";
import { cargarTablero } from "@/modules/dudas/application/use-cases";
import { leerFiltro, type FiltroDudas } from "@/modules/dudas/domain/duda";
import { COOKIE_SESION_DUDAS } from "@/modules/dudas/domain/sesion";
import { createDudasDeps } from "@/modules/dudas/infrastructure/prisma-dudas-repository";
import { EntrarForm } from "./entrar-form";
import { TarjetaDuda, type TarjetaVista } from "./tarjeta-duda";

// Dudas del catalogo: las asesoras responden preguntas sobre los productos. Se entra con el nombre y
// un codigo que da Emanuel (sin cuenta ni correo). Fuera de buscadores, del sitemap y de robots.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dudas del catálogo",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
};

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const FILTROS: { valor: FiltroDudas; etiqueta: string }[] = [
  { valor: "pendientes", etiqueta: "Pendientes" },
  { valor: "respondidas", etiqueta: "Respondidas" },
  { valor: "todas", etiqueta: "Todas" },
];

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6">
      <div className="mx-auto max-w-xl space-y-4">{children}</div>
    </main>
  );
}

export default async function DudasPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const filtro = leerFiltro(params.ver);
  const token = (await cookies()).get(COOKIE_SESION_DUDAS)?.value;

  let resultado: Awaited<ReturnType<typeof cargarTablero>>;
  try {
    resultado = await cargarTablero(createDudasDeps(), token, filtro);
  } catch (error) {
    console.error("[dudas] Fallo al cargar:", error);
    return (
      <Marco>
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          No pudimos cargar las dudas. Intenta de nuevo en un momento.
        </p>
      </Marco>
    );
  }

  if (!resultado.ok) {
    return (
      <Marco>
        <div className="space-y-1 pt-6">
          <h1 className="text-2xl font-semibold text-slate-900">Dudas del catálogo</h1>
          <p className="text-sm text-slate-600">
            Ayúdanos a dejar bien los productos: nombres, fotos, categorías y descripciones. Entra con tu nombre y tu código.
          </p>
        </div>
        <EntrarForm />
      </Marco>
    );
  }

  const { sesion, tablero } = resultado;
  const conTarjetas = tablero.grupos.filter((g) => g.tarjetas.length > 0);

  return (
    <Marco>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <h1 className="text-xl font-semibold text-slate-900">Dudas del catálogo</h1>
          <p className="text-sm text-slate-600">
            Hola, {sesion.nombre}. Faltan <strong>{tablero.pendientes}</strong> de {tablero.total}.
          </p>
        </div>
        <form action={salirDudasAction}>
          <button type="submit" className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-700">
            <LogOut className="h-4 w-4" /> Salir
          </button>
        </form>
      </div>

      <nav className="sticky top-0 z-10 -mx-4 flex gap-2 bg-slate-100/95 px-4 py-2 backdrop-blur">
        {FILTROS.map((f) => {
          const cuenta = f.valor === "pendientes" ? tablero.pendientes : f.valor === "respondidas" ? tablero.respondidas : tablero.total;
          const activo = f.valor === filtro;
          return (
            <Link
              key={f.valor}
              href={`/dudas?ver=${f.valor}`}
              className={`flex h-10 flex-1 items-center justify-center rounded-xl border text-sm font-medium ${
                activo ? "border-[#42066E] bg-[#42066E] text-white" : "border-slate-300 bg-white text-slate-700"
              }`}
            >
              {f.etiqueta} ({cuenta})
            </Link>
          );
        })}
      </nav>

      {conTarjetas.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">
          {filtro === "pendientes" ? "¡No queda ninguna pendiente! Gracias." : "No hay preguntas con este filtro."}
        </p>
      ) : (
        conTarjetas.map((grupo) => (
          <section key={grupo.grupo} className="space-y-3">
            <h2 className="flex items-baseline justify-between pt-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              <span>{grupo.etiqueta}</span>
              <span className="text-xs font-medium normal-case tracking-normal">
                {grupo.pendientes > 0 ? `Faltan ${grupo.pendientes} de ${grupo.total}` : `Completo (${grupo.total})`}
              </span>
            </h2>
            {grupo.tarjetas.map((t) => {
              const vista: TarjetaVista = {
                id: t.id,
                titulo: t.titulo,
                duda: t.duda,
                datos: t.datos,
                opciones: t.opciones,
                links: t.links,
                fotos: t.fotos,
                vigente: t.vigente
                  ? {
                      autorNombre: t.vigente.autorNombre,
                      fecha: t.vigente.createdAt.toISOString(),
                      opcionId: t.vigente.opcionId,
                      opcionTexto: t.vigente.opcionTexto,
                      texto: t.vigente.texto,
                      nota: t.vigente.nota,
                    }
                  : null,
              };
              return <TarjetaDuda key={t.id} tarjeta={vista} />;
            })}
          </section>
        ))
      )}
    </Marco>
  );
}
