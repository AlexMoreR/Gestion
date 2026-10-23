import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { QueryFeedbackToast } from "@/components/ui/query-feedback-toast";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { getTeamBoardUseCase } from "@/modules/equipo/application/use-cases";
import { TEAM_PAY_TYPES, todayInBogota, type TeamFilter, type TeamPayType } from "@/modules/equipo/domain/team-member";
import { createPrismaTeamRepository } from "@/modules/equipo/infrastructure/prisma-team-repository";
import { TeamMemberCard, TeamMemberForm } from "@/modules/equipo/presentation/team-member-form";

// Equipo (solo dueno/admin): ficha de cada trabajador con contacto, forma de pago, ingreso y
// salida. El estado Activo/Retirado sale de la fecha de salida.

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const ESTADOS: { value: TeamFilter["estado"]; label: string }[] = [
  { value: "activos", label: "Activos" },
  { value: "retirados", label: "Retirados" },
  { value: "todos", label: "Todos" },
];

const PAY_FILTER_LABELS: Record<TeamPayType, string> = {
  QUINCENAL: "Por quincena",
  DIARIO: "Por día",
  SOLO_COMISION: "Solo comisión",
};

function resolveFilter(params: Record<string, string | string[] | undefined>): TeamFilter {
  const estado = ESTADOS.some((item) => item.value === params.estado) ? (params.estado as TeamFilter["estado"]) : "activos";
  const q = typeof params.q === "string" ? params.q.slice(0, 80) : "";
  const pago = TEAM_PAY_TYPES.includes(params.pago as TeamPayType) ? (params.pago as TeamPayType) : "";
  return { estado, q, pago };
}

export default async function AdminEquipoPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/unauthorized");
  const canAccess = session.user.role === "ADMIN" && (await hasAdminModuleAccess(session.user.id, session.user.role, "team"));
  if (!canAccess) redirect("/unauthorized");

  const params = await searchParams;
  const filter = resolveFilter(params);
  const okMessage = typeof params.ok === "string" ? params.ok : "";
  const errorMessage = typeof params.error === "string" ? params.error : "";
  const today = todayInBogota();
  const board = await getTeamBoardUseCase(createPrismaTeamRepository(), filter, today);

  const filterHref = (estado: TeamFilter["estado"]) => {
    const query = new URLSearchParams({ estado });
    if (filter.q) query.set("q", filter.q);
    if (filter.pago) query.set("pago", filter.pago);
    return `/admin/equipo?${query.toString()}`;
  };

  return (
    <section className="w-full space-y-4">
      <QueryFeedbackToast okMessage={okMessage} errorMessage={errorMessage} okTitle="Equipo" errorTitle="Equipo" />

      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Equipo</h1>
        <p className="max-w-2xl text-xs text-muted-foreground">
          Ficha de cada trabajador. Quien tenga fecha de salida ya pasada queda Retirado/a: no aparece en la nómina después de
          su mes de salida (salvo que tenga comisión o pagos pendientes) ni en las listas para asignar, pero su historial se
          conserva. Lo que se paga sale de{" "}
          <Link href="/admin/comisiones/nomina" className="underline">
            Nómina
          </Link>
          .
        </p>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex gap-1.5">
          {ESTADOS.map((item) => (
            <Link
              key={item.value}
              href={filterHref(item.value)}
              className={`h-8 rounded-md border px-3 text-sm leading-8 ${
                filter.estado === item.value ? "border-primary bg-primary/10 font-medium text-foreground" : "border-border bg-card hover:bg-muted"
              }`}
            >
              {item.label} ({board.counts[item.value]})
            </Link>
          ))}
        </div>
        <form action="/admin/equipo" className="flex flex-wrap items-end gap-1.5">
          <input type="hidden" name="estado" value={filter.estado} />
          <input
            name="q"
            defaultValue={filter.q}
            placeholder="Buscar por nombre"
            className="h-8 w-48 rounded-md border border-border bg-card px-2 text-sm"
          />
          <select name="pago" defaultValue={filter.pago} className="h-8 rounded-md border border-border bg-card px-2 text-sm" aria-label="Forma de pago">
            <option value="">Toda forma de pago</option>
            {TEAM_PAY_TYPES.map((pay) => (
              <option key={pay} value={pay}>
                {PAY_FILTER_LABELS[pay]}
              </option>
            ))}
          </select>
          <button type="submit" className="h-8 rounded-md border border-border bg-card px-3 text-sm hover:bg-muted">
            Filtrar
          </button>
        </form>
      </div>

      {board.members.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No hay trabajadores con este filtro.
        </p>
      ) : (
        <div className="space-y-3">
          {board.members.map((member) => (
            <TeamMemberCard key={member.id} member={member} staffUsers={board.staffUsers} estado={filter.estado} today={today} />
          ))}
        </div>
      )}

      <details className="rounded-xl border border-dashed border-border bg-card p-4">
        <summary className="cursor-pointer text-sm font-semibold text-foreground">Agregar trabajador</summary>
        <TeamMemberForm staffUsers={board.staffUsers} estado={filter.estado} />
      </details>
    </section>
  );
}
