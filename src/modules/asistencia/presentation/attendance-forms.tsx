import { anularMarcaAction, corregirMarcaAction, marcarPorPersonaAction } from "@/app/actions/asistencia-actions";
import {
  ATTENDANCE_KIND_LABELS,
  ATTENDANCE_KINDS,
  ATTENDANCE_ORIGIN_LABELS,
  DAY_STATUS_LABELS,
  MIN_REASON_LENGTH,
  bogotaDay,
  bogotaTime,
  formatMinutes,
  type AttendanceKind,
  type AttendanceMark,
  type DaySummary,
} from "../domain/attendance";

// Formularios de servidor (sin JS) de la pantalla Asistencia: marcar por otra persona,
// agregar una marca olvidada, corregir y anular. Todo lo de correccion exige motivo.

export type AttendanceFilterFields = { vista: string; mes: string; persona: string };

const inputClass = "h-8 rounded-md border border-border bg-card px-2 text-sm";
const buttonClass = "h-8 rounded-md border border-border bg-card px-3 text-sm hover:bg-muted";

export function dayLabel(day: string): string {
  return new Date(`${day}T12:00:00.000Z`).toLocaleDateString("es-CO", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function FilterFields({ filter }: { filter: AttendanceFilterFields }) {
  return (
    <>
      <input type="hidden" name="vista" value={filter.vista} />
      {filter.mes ? <input type="hidden" name="mes" value={filter.mes} /> : null}
      {filter.persona ? <input type="hidden" name="persona" value={filter.persona} /> : null}
    </>
  );
}

const STATUS_CLASSES: Record<DaySummary["status"], string> = {
  TRABAJANDO: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  SALIO: "border-border bg-muted text-muted-foreground",
  NO_HA_LLEGADO: "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300",
};

const STATUS_DOTS: Record<DaySummary["status"], string> = {
  TRABAJANDO: "🟢",
  SALIO: "⚪",
  NO_HA_LLEGADO: "🔴",
};

export function StatusBadge({ summary, isToday }: { summary: DaySummary; isToday: boolean }) {
  // En un dia pasado sin entradas no es "no ha llegado" sino "no vino".
  const label = !isToday && summary.status === "NO_HA_LLEGADO" ? "Sin entrada" : DAY_STATUS_LABELS[summary.status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[summary.status]}`}>
      <span aria-hidden>{STATUS_DOTS[summary.status]}</span>
      {label}
    </span>
  );
}

export function DayTimes({ summary }: { summary: DaySummary }) {
  return (
    <span className="text-sm text-foreground">
      {summary.firstEntry ? bogotaTime(summary.firstEntry) : "—"}
      {" → "}
      {summary.lastExit ? bogotaTime(summary.lastExit) : summary.openEntry ? "sin salida" : "—"}
      <span className="ml-2 text-muted-foreground">{summary.worked ? formatMinutes(summary.minutes) : ""}</span>
    </span>
  );
}

export function DayWarnings({ summary }: { summary: DaySummary }) {
  return (
    <>
      {summary.missingExit ? (
        <p className="text-xs text-amber-700 dark:text-amber-300">Salió sin marcar salida: las horas de esa entrada no se cuentan.</p>
      ) : null}
      {summary.corrected ? (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Corregido.</span> {summary.reasons.join(" · ")}
        </p>
      ) : null}
    </>
  );
}

// Marcar por una persona que no puede hacerlo: hora del servidor, queda "marcada por un admin".
export function MarkForPersonForm({
  userId,
  next,
  filter,
}: {
  userId: string;
  next: AttendanceKind;
  filter: AttendanceFilterFields;
}) {
  return (
    <form action={marcarPorPersonaAction}>
      <FilterFields filter={filter} />
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="tipo" value={next} />
      <button type="submit" className={buttonClass}>
        Marcar {ATTENDANCE_KIND_LABELS[next].toLowerCase()} por esta persona
      </button>
    </form>
  );
}

function ManualFields({
  defaultKind,
  defaultDay,
  defaultTime,
  defaultNextDay = false,
}: {
  defaultKind: AttendanceKind;
  defaultDay: string;
  defaultTime: string;
  defaultNextDay?: boolean;
}) {
  return (
    <>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Tipo
        <select name="tipo" defaultValue={defaultKind} className={inputClass}>
          {ATTENDANCE_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {ATTENDANCE_KIND_LABELS[kind]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Día de trabajo
        <input type="date" name="dia" required defaultValue={defaultDay} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Hora (Colombia)
        <input type="time" name="hora" required defaultValue={defaultTime} className={inputClass} />
      </label>
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <input type="checkbox" name="diaSiguiente" defaultChecked={defaultNextDay} />
        Salida después de medianoche
      </label>
      <label className="flex min-w-56 flex-1 flex-col gap-1 text-xs text-muted-foreground">
        Motivo (obligatorio)
        <input
          name="motivo"
          required
          minLength={MIN_REASON_LENGTH}
          maxLength={300}
          placeholder="Ej. olvidó marcar al llegar"
          className={inputClass}
        />
      </label>
    </>
  );
}

// Agregar una marca olvidada (queda como "Corregida" con quien, cuando y por que).
export function AddMarkForm({
  userId,
  defaultDay,
  filter,
}: {
  userId: string;
  defaultDay: string;
  filter: AttendanceFilterFields;
}) {
  return (
    <details className="rounded-lg border border-dashed border-border p-2">
      <summary className="cursor-pointer text-xs font-medium text-foreground">Agregar marca olvidada</summary>
      <form action={corregirMarcaAction} className="mt-2 flex flex-wrap items-end gap-2">
        <FilterFields filter={filter} />
        <input type="hidden" name="userId" value={userId} />
        <ManualFields defaultKind="ENTRADA" defaultDay={defaultDay} defaultTime="" />
        <button type="submit" className={buttonClass}>
          Agregar
        </button>
      </form>
    </details>
  );
}

// Lista de marcas de un dia con su origen; las vigentes se pueden corregir o anular.
export function MarksList({ marks, filter }: { marks: AttendanceMark[]; filter: AttendanceFilterFields }) {
  if (marks.length === 0) return null;
  return (
    <ul className="space-y-1.5">
      {marks.map((mark) => {
        const voided = mark.voidedAt !== null;
        // Una salida de madrugada se corrige con "despues de medianoche" marcado.
        const afterMidnight = mark.kind === "SALIDA" && bogotaDay(mark.markedAt) !== mark.day;
        return (
          <li key={mark.id} className={`rounded-md border border-border p-2 text-xs ${voided ? "opacity-60" : ""}`}>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className={`font-medium text-foreground ${voided ? "line-through" : ""}`}>
                {ATTENDANCE_KIND_LABELS[mark.kind]} {bogotaTime(mark.markedAt)}
                {afterMidnight ? " (día siguiente)" : ""}
              </span>
              <span className="text-muted-foreground">
                {ATTENDANCE_ORIGIN_LABELS[mark.origin]}
                {mark.origin !== "PROPIA" && mark.createdByName ? `: ${mark.createdByName}` : ""}
                {mark.origin === "CORRECCION" ? ` el ${dayLabel(bogotaDay(mark.createdAt))} ${bogotaTime(mark.createdAt)}` : ""}
              </span>
              {mark.reason ? <span className="text-muted-foreground">· Motivo: {mark.reason}</span> : null}
              {voided ? (
                <span className="text-red-700 dark:text-red-300">
                  · Anulada{mark.voidedByName ? ` por ${mark.voidedByName}` : ""}
                  {mark.voidedAt ? ` el ${dayLabel(bogotaDay(mark.voidedAt))} ${bogotaTime(mark.voidedAt)}` : ""}
                  {mark.voidReason ? `: ${mark.voidReason}` : ""}
                </span>
              ) : null}
            </div>
            {voided ? null : (
              <details className="mt-1">
                <summary className="cursor-pointer text-muted-foreground">Corregir o anular</summary>
                <form action={corregirMarcaAction} className="mt-2 flex flex-wrap items-end gap-2">
                  <FilterFields filter={filter} />
                  <input type="hidden" name="markId" value={mark.id} />
                  <ManualFields
                    defaultKind={mark.kind}
                    defaultDay={mark.day}
                    defaultTime={bogotaTime(mark.markedAt)}
                    defaultNextDay={afterMidnight}
                  />
                  <button type="submit" className={buttonClass}>
                    Guardar corrección
                  </button>
                </form>
                <form action={anularMarcaAction} className="mt-2 flex flex-wrap items-end gap-2">
                  <FilterFields filter={filter} />
                  <input type="hidden" name="markId" value={mark.id} />
                  <label className="flex min-w-56 flex-1 flex-col gap-1 text-xs text-muted-foreground">
                    Motivo para anular (obligatorio)
                    <input
                      name="motivo"
                      required
                      minLength={MIN_REASON_LENGTH}
                      maxLength={300}
                      placeholder="Ej. entrada repetida por error"
                      className={inputClass}
                    />
                  </label>
                  <button type="submit" className={`${buttonClass} text-red-700 dark:text-red-300`}>
                    Anular marca
                  </button>
                </form>
              </details>
            )}
          </li>
        );
      })}
    </ul>
  );
}
