import { saveTeamMemberAction, setTeamExitAction } from "@/app/actions/team-actions";
import type { TeamBoardMember } from "../application/use-cases";
import {
  TEAM_EMPLOYMENT_LABELS,
  TEAM_EMPLOYMENT_TYPES,
  TEAM_PAY_LABELS,
  TEAM_PAY_TYPES,
  TEAM_STATUS_LABELS,
  type TeamFilter,
  type TeamMember,
} from "../domain/team-member";

// Ficha y formulario de un trabajador (pantalla Equipo). Formularios de servidor, sin JS.

type StaffUserOption = { id: string; label: string; linkedTo: string | null };

const inputClass = "h-8 w-full rounded-md border border-border bg-background px-2 text-sm";
const buttonClass = "h-8 rounded-md border border-border bg-card px-3 text-sm hover:bg-muted";
const primaryButtonClass = "h-8 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90";

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-md bg-muted/40 px-2.5 py-1.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={`text-sm ${value ? "text-foreground" : "text-muted-foreground"}`}>{value || "Sin dato"}</p>
    </div>
  );
}

export function TeamMemberCard({
  member,
  staffUsers,
  estado,
  today,
}: {
  member: TeamBoardMember;
  staffUsers: StaffUserOption[];
  estado: TeamFilter["estado"];
  today: string;
}) {
  const retired = member.status === "RETIRADO";
  const emergency = [member.emergencyName, member.emergencyPhone].filter(Boolean).join(" · ") || null;
  return (
    <div className={`space-y-3 rounded-xl border p-4 ${retired ? "border-border bg-muted/20" : "border-border bg-card"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            {member.fullName}
            <span
              className={`ml-1.5 rounded-full px-2 py-0.5 text-[11px] font-normal ${
                retired ? "bg-muted text-muted-foreground" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200"
              }`}
            >
              {TEAM_STATUS_LABELS[member.status]}
            </span>
          </h2>
          <p className="text-xs text-muted-foreground">
            {[
              member.isOwner ? "Dueño" : member.jobTitle,
              TEAM_EMPLOYMENT_LABELS[member.employmentType],
              member.payType ? TEAM_PAY_LABELS[member.payType] : "Forma de pago sin definir",
              member.userLabel ? `Usuario: ${member.userLabel}` : "Sin usuario en Gestión",
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <p className="text-right text-xs text-muted-foreground">
          Ingreso: {member.startDate ?? "sin dato"}
          {member.endDate ? (
            <>
              <br />
              Salida: {member.endDate}
              {member.exitReason ? ` · ${member.exitReason}` : " · motivo sin escribir"}
            </>
          ) : null}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Detail label="Cédula" value={member.document} />
        <Detail
          label="Nacimiento"
          value={member.birthDate ? `${member.birthDate}${member.age !== null ? ` (${member.age} años)` : ""}` : null}
        />
        <Detail label="Celular" value={member.phone} />
        <Detail label="Correo" value={member.email} />
        <Detail label="Dirección" value={member.address} />
        <Detail label="Contacto de emergencia" value={emergency} />
        {member.notes ? <Detail label="Notas" value={member.notes} /> : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <details className="w-full rounded-lg border border-border p-3 open:bg-muted/20 md:w-auto md:min-w-[520px]">
          <summary className="cursor-pointer text-sm font-medium text-primary">Editar ficha</summary>
          <TeamMemberForm member={member} staffUsers={staffUsers} estado={estado} />
        </details>

        {member.endDate ? (
          <form action={setTeamExitAction} className="flex items-center">
            <input type="hidden" name="memberId" value={member.id} />
            <input type="hidden" name="estado" value={estado} />
            <input type="hidden" name="reactivar" value="1" />
            <button type="submit" className={buttonClass}>
              {retired ? "Reactivar (volvió)" : "Quitar fecha de salida"}
            </button>
          </form>
        ) : (
          <details className="w-full rounded-lg border border-border p-3 open:bg-muted/20 md:w-auto md:min-w-[360px]">
            <summary className="cursor-pointer text-sm font-medium text-destructive">Dar de baja</summary>
            <form action={setTeamExitAction} className="mt-3 grid gap-2 sm:grid-cols-2">
              <input type="hidden" name="memberId" value={member.id} />
              <input type="hidden" name="estado" value={estado} />
              <label className="space-y-1 text-xs text-muted-foreground">
                Último día trabajado
                <input type="date" name="endDate" required defaultValue={today} className={inputClass} />
              </label>
              <label className="space-y-1 text-xs text-muted-foreground">
                Motivo
                <input name="exitReason" maxLength={300} className={inputClass} />
              </label>
              <div className="sm:col-span-2">
                <button type="submit" className={primaryButtonClass}>
                  Dar de baja
                </button>
              </div>
            </form>
          </details>
        )}
      </div>
    </div>
  );
}

export function TeamMemberForm({
  member,
  staffUsers,
  estado,
}: {
  member?: TeamMember;
  staffUsers: StaffUserOption[];
  estado: TeamFilter["estado"];
}) {
  // Un usuario solo se une a una ficha: se ofrecen los libres y el de esta ficha.
  const userOptions = staffUsers.filter((user) => !user.linkedTo || user.id === member?.userId);
  return (
    <form action={saveTeamMemberAction} className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {member ? <input type="hidden" name="memberId" value={member.id} /> : null}
      <input type="hidden" name="estado" value={estado} />

      <p className="text-xs font-semibold text-foreground sm:col-span-2 lg:col-span-3">Datos personales</p>
      <label className="space-y-1 text-xs text-muted-foreground sm:col-span-2">
        Nombre completo
        <input name="fullName" required minLength={2} maxLength={120} defaultValue={member?.fullName ?? ""} className={inputClass} />
      </label>
      <label className="space-y-1 text-xs text-muted-foreground">
        Cédula
        <input name="document" maxLength={30} defaultValue={member?.document ?? ""} className={inputClass} />
      </label>
      <label className="space-y-1 text-xs text-muted-foreground">
        Fecha de nacimiento
        <input type="date" name="birthDate" defaultValue={member?.birthDate ?? ""} className={inputClass} />
      </label>
      <label className="space-y-1 text-xs text-muted-foreground">
        Celular
        <input name="phone" inputMode="tel" maxLength={30} defaultValue={member?.phone ?? ""} className={inputClass} />
      </label>
      <label className="space-y-1 text-xs text-muted-foreground">
        Correo
        <input type="email" name="email" maxLength={120} defaultValue={member?.email ?? ""} className={inputClass} />
      </label>
      <label className="space-y-1 text-xs text-muted-foreground sm:col-span-2 lg:col-span-3">
        Dirección
        <input name="address" maxLength={200} defaultValue={member?.address ?? ""} className={inputClass} />
      </label>
      <label className="space-y-1 text-xs text-muted-foreground">
        Contacto de emergencia (nombre)
        <input name="emergencyName" maxLength={120} defaultValue={member?.emergencyName ?? ""} className={inputClass} />
      </label>
      <label className="space-y-1 text-xs text-muted-foreground">
        Contacto de emergencia (celular)
        <input name="emergencyPhone" inputMode="tel" maxLength={30} defaultValue={member?.emergencyPhone ?? ""} className={inputClass} />
      </label>

      <p className="pt-2 text-xs font-semibold text-foreground sm:col-span-2 lg:col-span-3">Trabajo</p>
      <label className="space-y-1 text-xs text-muted-foreground">
        Cargo
        <input name="jobTitle" maxLength={60} placeholder="Asesora, Producción…" defaultValue={member?.jobTitle ?? ""} className={inputClass} />
      </label>
      <label className="space-y-1 text-xs text-muted-foreground">
        Tipo de vinculación
        <select name="employmentType" defaultValue={member?.employmentType ?? "FREELANCE"} className={inputClass}>
          {TEAM_EMPLOYMENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {TEAM_EMPLOYMENT_LABELS[type]}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1 text-xs text-muted-foreground">
        Forma de pago
        <select name="payType" defaultValue={member?.payType ?? ""} className={inputClass}>
          <option value="">Sin definir</option>
          {TEAM_PAY_TYPES.map((type) => (
            <option key={type} value={type}>
              {TEAM_PAY_LABELS[type]}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1 text-xs text-muted-foreground">
        Usuario en Gestión
        <select name="userId" defaultValue={member?.userId ?? ""} className={inputClass}>
          <option value="">Sin usuario</option>
          {userOptions.map((user) => (
            <option key={user.id} value={user.id}>
              {user.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 self-end pb-1.5 text-xs text-muted-foreground">
        <input type="checkbox" name="isOwner" defaultChecked={member?.isOwner ?? false} />
        Es el dueño
      </label>

      <p className="pt-2 text-xs font-semibold text-foreground sm:col-span-2 lg:col-span-3">Fechas</p>
      <label className="space-y-1 text-xs text-muted-foreground">
        Fecha de ingreso
        <input type="date" name="startDate" defaultValue={member?.startDate ?? ""} className={inputClass} />
      </label>
      <label className="space-y-1 text-xs text-muted-foreground">
        Fecha de salida (último día)
        <input type="date" name="endDate" defaultValue={member?.endDate ?? ""} className={inputClass} />
      </label>
      <label className="space-y-1 text-xs text-muted-foreground">
        Motivo de salida
        <input name="exitReason" maxLength={300} defaultValue={member?.exitReason ?? ""} className={inputClass} />
      </label>
      <label className="space-y-1 text-xs text-muted-foreground sm:col-span-2 lg:col-span-3">
        Notas
        <input name="notes" maxLength={500} defaultValue={member?.notes ?? ""} className={inputClass} />
      </label>

      <div className="sm:col-span-2 lg:col-span-3">
        <button type="submit" className={primaryButtonClass}>
          {member ? "Guardar ficha" : "Crear ficha"}
        </button>
      </div>
    </form>
  );
}
