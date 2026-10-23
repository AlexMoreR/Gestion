import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { QueryFeedbackToast } from "@/components/ui/query-feedback-toast";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { getMonthBoardUseCase, getTodayBoardUseCase } from "@/modules/asistencia/application/use-cases";
import {
  attendanceDrivesPayroll,
  formatMinutes,
  isMonthKey,
  ASISTENCIA_NOMINA_DESDE,
} from "@/modules/asistencia/domain/attendance";
import { createPrismaAsistenciaRepository } from "@/modules/asistencia/infrastructure/prisma-asistencia-repository";
import {
  AddMarkForm,
  DayTimes,
  DayWarnings,
  MarkForPersonForm,
  MarksList,
  StatusBadge,
  dayLabel,
  type AttendanceFilterFields,
} from "@/modules/asistencia/presentation/attendance-forms";
import { todayInBogota } from "@/modules/equipo/domain/team-member";

// Asistencia (solo dueno/admin): quien esta trabajando hoy y las entradas y salidas del mes,
// con las correcciones. Cada trabajador marca la suya con el boton de la barra.

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function monthTitle(month: string): string {
  const [year, mon] = month.split("-").map(Number);
  const label = new Date(Date.UTC(year, mon - 1, 15)).toLocaleDateString("es-CO", { month: "long", year: "numeric", timeZone: "UTC" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export default async function AdminAsistenciaPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/unauthorized");
  const canAccess =
    session.user.role === "ADMIN" && (await hasAdminModuleAccess(session.user.id, session.user.role, "attendance"));
  if (!canAccess) redirect("/unauthorized");

  const params = await searchParams;
  const okMessage = typeof params.ok === "string" ? params.ok : "";
  const errorMessage = typeof params.error === "string" ? params.error : "";
  const today = todayInBogota();
  const vista = params.vista === "mes" ? "mes" : "hoy";
  const mes = typeof params.mes === "string" && isMonthKey(params.mes) ? params.mes : today.slice(0, 7);
  const persona = typeof params.persona === "string" ? params.persona.slice(0, 40) : "";
  const filter: AttendanceFilterFields = { vista, mes: vista === "mes" ? mes : "", persona: vista === "mes" ? persona : "" };

  const repo = createPrismaAsistenciaRepository();
  const [todayBoard, monthBoard, staff] = await Promise.all([
    vista === "hoy" ? getTodayBoardUseCase(repo) : Promise.resolve(null),
    vista === "mes" ? getMonthBoardUseCase(repo, mes, persona || undefined) : Promise.resolve(null),
    repo.listStaff(),
  ]);

  const tabClass = (active: boolean) =>
    `h-8 rounded-md border px-3 text-sm leading-8 ${
      active ? "border-primary bg-primary/10 font-medium text-foreground" : "border-border bg-card hover:bg-muted"
    }`;

  return (
    <section className="w-full space-y-4">
      <QueryFeedbackToast okMessage={okMessage} errorMessage={errorMessage} okTitle="Asistencia" errorTitle="Asistencia" />

      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Asistencia</h1>
        <p className="max-w-2xl text-xs text-muted-foreground">
          Cada trabajador marca su entrada y su salida con el botón de la barra (celular o PC); la hora la pone el servidor y
          no se puede cambiar. Si alguien olvidó marcar, aquí se agrega o se corrige con un motivo: la marca original no se
          borra, queda anulada. Un día cuenta como trabajado si tiene al menos una entrada. Desde{" "}
          {monthTitle(ASISTENCIA_NOMINA_DESDE).toLowerCase()} la{" "}
          <Link href="/admin/comisiones/nomina" className="underline">
            Nómina
          </Link>{" "}
          de quien cobra por día toma los días de aquí.
        </p>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex gap-1.5">
          <Link href="/admin/asistencia" className={tabClass(vista === "hoy")}>
            Hoy
          </Link>
          <Link href={`/admin/asistencia?vista=mes&mes=${mes}`} className={tabClass(vista === "mes")}>
            Por mes
          </Link>
        </div>
        {vista === "mes" ? (
          <form action="/admin/asistencia" className="flex flex-wrap items-end gap-1.5">
            <input type="hidden" name="vista" value="mes" />
            <input type="month" name="mes" defaultValue={mes} className="h-8 rounded-md border border-border bg-card px-2 text-sm" aria-label="Mes" />
            <select name="persona" defaultValue={persona} className="h-8 rounded-md border border-border bg-card px-2 text-sm" aria-label="Persona">
              <option value="">Todas las personas</option>
              {staff.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
            <button type="submit" className="h-8 rounded-md border border-border bg-card px-3 text-sm hover:bg-muted">
              Filtrar
            </button>
          </form>
        ) : null}
      </div>

      {todayBoard ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {dayLabel(todayBoard.today)} ·{" "}
            {todayBoard.rows.filter((row) => row.summary.status === "TRABAJANDO").length} trabajando de {todayBoard.rows.length}
          </p>
          {todayBoard.rows.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No hay trabajadores (usuarios Empleado o Admin) activos hoy.
            </p>
          ) : (
            todayBoard.rows.map(({ person, summary }) => (
              <article key={person.id} className="space-y-2 rounded-xl border border-border bg-card p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-foreground">{person.name}</span>
                    <StatusBadge summary={summary} isToday={summary.day === todayBoard.today} />
                    {summary.day !== todayBoard.today ? (
                      <span className="text-xs text-muted-foreground">turno del {dayLabel(summary.day)}</span>
                    ) : null}
                  </div>
                  <DayTimes summary={summary} />
                </div>
                <DayWarnings summary={summary} />
                <MarksList marks={summary.marks} filter={filter} />
                <div className="flex flex-wrap items-start gap-2">
                  <MarkForPersonForm
                    userId={person.id}
                    next={summary.status === "TRABAJANDO" ? "SALIDA" : "ENTRADA"}
                    filter={filter}
                  />
                  <AddMarkForm userId={person.id} defaultDay={summary.day} filter={filter} />
                </div>
              </article>
            ))
          )}
        </div>
      ) : null}

      {monthBoard ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {monthTitle(mes)}
            {attendanceDrivesPayroll(mes)
              ? " · la nómina por día de este mes sale de estos registros."
              : " · este mes la nómina usa los días escritos a mano (la asistencia manda desde " +
                monthTitle(ASISTENCIA_NOMINA_DESDE).toLowerCase() +
                ")."}
          </p>
          {monthBoard.people.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No hay registros para este filtro.
            </p>
          ) : (
            monthBoard.people.map((row) => (
              <article key={row.person.id} className="space-y-2 rounded-xl border border-border bg-card p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-foreground">{row.person.name}</span>
                  <span className="text-sm text-foreground">
                    <strong>{row.workedDays}</strong> {row.workedDays === 1 ? "día trabajado" : "días trabajados"} ·{" "}
                    {formatMinutes(row.minutes)}
                    {row.corrections > 0 ? ` · ${row.corrections} con corrección` : ""}
                    {row.missingExits > 0 ? ` · ${row.missingExits} sin salida` : ""}
                  </span>
                </div>
                {!persona ? (
                  <Link
                    href={`/admin/asistencia?vista=mes&mes=${mes}&persona=${row.person.id}`}
                    className="text-xs text-muted-foreground underline"
                  >
                    Ver marcas y corregir
                  </Link>
                ) : null}
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-muted-foreground">
                        <th className="py-1 pr-2 font-medium">Día</th>
                        <th className="py-1 pr-2 font-medium">Estado</th>
                        <th className="py-1 pr-2 font-medium">Entrada → salida · horas</th>
                        <th className="py-1 font-medium">Notas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...row.days].reverse().map((day) => (
                        <tr key={day.day} className="border-b border-border/60 align-top">
                          <td className="py-1.5 pr-2 whitespace-nowrap text-foreground">{dayLabel(day.day)}</td>
                          <td className="py-1.5 pr-2">
                            <StatusBadge summary={day} isToday={day.day === today} />
                          </td>
                          <td className="py-1.5 pr-2">
                            <DayTimes summary={day} />
                          </td>
                          <td className="space-y-1 py-1.5">
                            <DayWarnings summary={day} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {persona ? (
                  // Marcas por dia, fuera de la tabla para que en celular se puedan corregir sin desplazar.
                  <div className="space-y-2">
                    <h2 className="text-sm font-semibold text-foreground">Marcas del mes</h2>
                    {[...row.days]
                      .reverse()
                      .filter((day) => day.marks.length > 0)
                      .map((day) => (
                        <div key={day.day} className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">{dayLabel(day.day)}</p>
                          <MarksList marks={day.marks} filter={filter} />
                        </div>
                      ))}
                  </div>
                ) : null}
                {persona ? <AddMarkForm userId={row.person.id} defaultDay={today.startsWith(mes) ? today : `${mes}-01`} filter={filter} /> : null}
              </article>
            ))
          )}
        </div>
      ) : null}
    </section>
  );
}
