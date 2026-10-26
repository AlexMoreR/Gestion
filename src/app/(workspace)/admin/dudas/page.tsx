import Link from "next/link";
import { redirect } from "next/navigation";
import { Download } from "lucide-react";

import { auth } from "@/auth";
import { desactivarAccesoDudasAction } from "@/app/actions/dudas-actions";
import { QueryFeedbackToast } from "@/components/ui/query-feedback-toast";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { getSiteUrl } from "@/lib/site";
import { filasDeRespuestas, resumenPorGrupo } from "@/modules/dudas/application/reportes";
import { etiquetaGrupo, formatearFecha } from "@/modules/dudas/domain/duda";
import { createPrismaDudasRepository } from "@/modules/dudas/infrastructure/prisma-dudas-repository";
import { CrearAccesoForm } from "./crear-acceso-form";

// Dudas del catalogo (solo dueno/admin): codigos de acceso para /dudas, resumen por grupo y todas las
// respuestas (historial) con quien y cuando. Exportar CSV en /admin/dudas/export.

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const LIMITE_TABLA = 300;

export default async function AdminDudasPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/unauthorized");
  const canAccess = session.user.role === "ADMIN" && (await hasAdminModuleAccess(session.user.id, session.user.role, "dudas"));
  if (!canAccess) redirect("/unauthorized");

  const params = await searchParams;
  const okMessage = typeof params.ok === "string" ? params.ok : "";
  const repo = createPrismaDudasRepository();
  const [dudas, respuestas, accesos] = await Promise.all([repo.listarDudas(), repo.listarRespuestas(), repo.listarAccesos()]);
  const resumen = resumenPorGrupo(dudas, respuestas);
  const filas = filasDeRespuestas(dudas, respuestas);

  return (
    <section className="w-full space-y-6">
      <QueryFeedbackToast okMessage={okMessage} okTitle="Dudas del catálogo" errorTitle="Dudas del catálogo" />

      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Dudas del catálogo</h1>
        <p className="max-w-2xl text-xs text-muted-foreground">
          Las asesoras responden en{" "}
          <Link href="/dudas" className="underline" target="_blank">
            magilus.com/dudas
          </Link>{" "}
          con su nombre y un código (sin cuenta ni correo). Cada respuesta queda en el historial; la última es la vigente.
        </p>
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Crear acceso</h2>
        <CrearAccesoForm urlDudas={getSiteUrl("/dudas")} />
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Accesos ({accesos.filter((a) => a.activo).length} activos)</h2>
        {accesos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay accesos. Crea el primero arriba.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1.5 pr-3 font-medium">Nombre</th>
                  <th className="py-1.5 pr-3 font-medium">Creado</th>
                  <th className="py-1.5 pr-3 font-medium">Último uso</th>
                  <th className="py-1.5 pr-3 font-medium">Estado</th>
                  <th className="py-1.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {accesos.map((a) => (
                  <tr key={a.id}>
                    <td className="py-2 pr-3 font-medium">{a.nombre}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{formatearFecha(a.createdAt)}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{a.ultimoUso ? formatearFecha(a.ultimoUso) : "Nunca"}</td>
                    <td className="py-2 pr-3">{a.activo ? "Activo" : <span className="text-muted-foreground">Desactivado</span>}</td>
                    <td className="py-2 text-right">
                      {a.activo ? (
                        <form action={desactivarAccesoDudasAction}>
                          <input type="hidden" name="id" value={a.id} />
                          <button type="submit" className="h-8 rounded-md border border-border px-3 text-xs hover:bg-muted">
                            Desactivar
                          </button>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">
          Resumen: {resumen.respondidas} respondidas, {resumen.pendientes} pendientes de {resumen.total}
        </h2>
        {resumen.total === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay preguntas cargadas. Se cargan con <code>npm run dudas:importar</code> (ver scripts/importar-dudas.ts).
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {resumen.grupos.map((g) => (
              <div key={g.grupo} className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">{g.etiqueta}</p>
                <p className="text-lg font-semibold">
                  {g.respondidas}/{g.total}
                </p>
                <p className="text-xs text-muted-foreground">{g.pendientes > 0 ? `Faltan ${g.pendientes}` : "Completo"}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Respuestas ({filas.length})</h2>
          <Link
            href="/admin/dudas/export"
            prefetch={false}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs hover:bg-muted"
          >
            <Download className="h-3.5 w-3.5" /> Exportar CSV
          </Link>
        </div>
        {filas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay respuestas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1.5 pr-3 font-medium">Pregunta</th>
                  <th className="py-1.5 pr-3 font-medium">Respuesta</th>
                  <th className="py-1.5 pr-3 font-medium">Quién</th>
                  <th className="py-1.5 font-medium">Cuándo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border align-top">
                {filas.slice(0, LIMITE_TABLA).map(({ respuesta: r, duda: d, vigente }) => (
                  <tr key={r.id} className={vigente ? "" : "text-muted-foreground"}>
                    <td className="max-w-xs py-2 pr-3">
                      <p className="text-xs text-muted-foreground">
                        {r.dudaId}
                        {d ? ` · ${etiquetaGrupo(d.grupo)}` : ""}
                        {d?.codigo ? ` · ${d.codigo}` : ""}
                      </p>
                      <p>{d?.titulo ?? "(pregunta borrada)"}</p>
                    </td>
                    <td className="max-w-sm py-2 pr-3">
                      <p className="font-medium">
                        {r.opcionTexto || r.opcionId}
                        {vigente ? "" : " (reemplazada)"}
                      </p>
                      {r.texto ? <p className="whitespace-pre-wrap">{r.texto}</p> : null}
                      {r.nota ? <p className="whitespace-pre-wrap text-xs">Nota: {r.nota}</p> : null}
                    </td>
                    <td className="py-2 pr-3">{r.autorNombre}</td>
                    <td className="whitespace-nowrap py-2">{formatearFecha(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filas.length > LIMITE_TABLA ? (
              <p className="pt-2 text-xs text-muted-foreground">Se muestran las {LIMITE_TABLA} más nuevas. El CSV trae todas.</p>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
