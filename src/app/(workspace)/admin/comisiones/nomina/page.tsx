import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";

import { auth } from "@/auth";
import { QueryFeedbackToast } from "@/components/ui/query-feedback-toast";
import {
  payPayrollAction,
  regenerateSellerLinkAction,
  removePayrollPersonAction,
  savePayrollDaysAction,
  savePayrollPersonAction,
  savePayrollTrmAction,
} from "@/app/actions/nomina-actions";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";
import { getSystemCurrency } from "@/lib/system-settings";
import { currentMonthInBogota } from "@/modules/asesor/domain/calculations";
import { createPrismaAsesorRepository } from "@/modules/asesor/infrastructure/prisma-asesor-repository";
import { getMoneyWithoutAccount } from "@/modules/balances/infrastructure/prisma-money-without-account";
import { createPrismaBalancesRepository } from "@/modules/balances/infrastructure/prisma-balances-repository";
import { CashPositionStrip } from "@/modules/balances/presentation/components/cash-position-strip";
import { getCashPositionUseCase, getPayrollBoardUseCase } from "@/modules/nomina/application/use-cases";
import { PAY_PERIOD_LABELS, type PayrollRow } from "@/modules/nomina/domain/payroll";
import { createPrismaNominaRepository } from "@/modules/nomina/infrastructure/prisma-nomina-repository";
import { listSellerLinks } from "@/modules/nomina/infrastructure/prisma-seller-portal";
import { getSiteUrl } from "@/lib/site";
import { CopyButton } from "@/modules/guias/presentation/copy-button";

// Nomina del mes (solo dueno/admin): basico de cada persona + comisiones - lo ya pagado,
// con el dinero disponible hoy arriba para saber si alcanza. Pagar crea un gasto de
// "Nomina" desde la cuenta elegida, asi el saldo de esa cuenta baja solo.

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const inputClass = "h-8 w-full rounded-md border border-border bg-background px-2 text-sm";
const buttonClass = "h-8 rounded-md border border-border bg-card px-3 text-sm hover:bg-muted";
const primaryButtonClass = "h-8 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90";

function resolveMonth(raw: unknown): { mes: number; anio: number } {
  if (typeof raw === "string" && /^\d{4}-\d{2}$/.test(raw)) {
    const [anio, mes] = raw.split("-").map(Number);
    if (mes >= 1 && mes <= 12 && anio >= 2020 && anio <= 2100) return { mes, anio };
  }
  return currentMonthInBogota();
}

const monthValue = (mes: number, anio: number) => `${anio}-${String(mes).padStart(2, "0")}`;

function shiftMonth(mes: number, anio: number, delta: number): string {
  const date = new Date(Date.UTC(anio, mes - 1 + delta, 1));
  return monthValue(date.getUTCMonth() + 1, date.getUTCFullYear());
}

function monthLabel(mes: number, anio: number): string {
  return new Date(Date.UTC(anio, mes - 1, 1)).toLocaleDateString("es", { month: "long", year: "numeric", timeZone: "UTC" });
}

function todayInBogota(): string {
  return new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function baseDescription(row: PayrollRow, money: (value: number) => string): string {
  if (!row.period) return "Sin configurar";
  if (row.period === "SIN_BASE") return "Sin básico";
  const unit =
    row.currency === "USD"
      ? `US$${row.baseAmount.toLocaleString("es-CO")}`
      : money(row.baseAmount);
  return row.period === "QUINCENAL" ? `${unit} por quincena` : `${unit} por día`;
}

export default async function AdminNominaPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/unauthorized");
  const canAccess =
    session.user.role === "ADMIN" && (await hasAdminModuleAccess(session.user.id, session.user.role, "commissions"));
  if (!canAccess) redirect("/unauthorized");

  const params = await searchParams;
  const { mes, anio } = resolveMonth(params.mes);
  const mesValue = monthValue(mes, anio);
  const current = currentMonthInBogota();
  const isCurrentMonth = current.mes === mes && current.anio === anio;
  const okMessage = typeof params.ok === "string" ? params.ok : "";
  const errorMessage = typeof params.error === "string" ? params.error : "";

  const balances = createPrismaBalancesRepository();
  const nomina = createPrismaNominaRepository();
  const [currency, board, cash, staff, config, sellerLinks] = await Promise.all([
    getSystemCurrency(),
    getPayrollBoardUseCase({ balances, asesor: createPrismaAsesorRepository(), nomina }, mes, anio),
    getCashPositionUseCase(balances, getMoneyWithoutAccount),
    nomina.listStaff(),
    nomina.getConfig(),
    listSellerLinks(),
  ]);
  const money = (value: number) => formatMoney(value, currency as SupportedCurrencyCode);
  const activeAccounts = cash.accounts.filter((account) => account.isActive);
  const unconfiguredStaff = staff.filter((member) => !config.people.some((person) => person.userId === member.id));
  const today = todayInBogota();

  return (
    <section className="w-full space-y-4">
      <QueryFeedbackToast okMessage={okMessage} errorMessage={errorMessage} okTitle="Nómina" errorTitle="Nómina" />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold capitalize tracking-tight text-foreground">Nómina · {monthLabel(mes, anio)}</h1>
          <p className="max-w-2xl text-xs text-muted-foreground">
            Básico del mes + comisiones del mes − lo ya pagado. Las comisiones salen de{" "}
            <Link href={`/admin/comisiones?mes=${mesValue}`} className="underline">
              Comisiones
            </Link>{" "}
            y siguen subiendo mientras haya ventas. Cada pago se registra como gasto de Nómina desde la cuenta que elijas.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Link href={`/admin/comisiones/nomina?mes=${shiftMonth(mes, anio, -1)}`} className={`${buttonClass} inline-flex w-8 items-center justify-center px-0`} aria-label="Mes anterior">
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <form action="/admin/comisiones/nomina" className="flex items-center gap-1.5">
            <input type="month" name="mes" defaultValue={mesValue} className="h-8 rounded-md border border-border bg-card px-2 text-sm" aria-label="Mes" />
            <button type="submit" className={buttonClass}>Ver</button>
          </form>
          <Link href={`/admin/comisiones/nomina?mes=${shiftMonth(mes, anio, 1)}`} className={`${buttonClass} inline-flex w-8 items-center justify-center px-0`} aria-label="Mes siguiente">
            <ChevronRight className="h-4 w-4" />
          </Link>
          {!isCurrentMonth ? (
            <Link href="/admin/comisiones/nomina" className={`${buttonClass} inline-flex items-center`}>Mes actual</Link>
          ) : null}
        </div>
      </div>

      <CashPositionStrip position={cash} currency={currency as SupportedCurrencyCode} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          { label: "Básicos del mes", value: money(board.totals.base) },
          { label: "Comisiones del mes", value: money(board.totals.commission) },
          { label: "Total nómina", value: money(board.totals.due) },
          { label: "Ya pagado", value: money(board.totals.paid) },
          { label: "Falta pagar", value: money(board.totals.pending), strong: true },
        ].map((stat) => (
          <div key={stat.label} className={`rounded-xl border p-4 ${stat.strong ? "border-primary/40 bg-primary/5" : "border-border bg-card"}`}>
            <p className="text-xs text-muted-foreground">{stat.label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{stat.value}</p>
          </div>
        ))}
      </div>

      {board.totals.incomplete ? (
        <p className="flex gap-1.5 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Hay personas sin calcular (falta la TRM o los días trabajados): el total no las incluye completas.
        </p>
      ) : null}
      {isCurrentMonth && board.totals.pending > cash.total ? (
        <p className="flex gap-1.5 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Lo que falta pagar de nómina ({money(board.totals.pending)}) es mayor que el dinero disponible hoy ({money(cash.total)}).
        </p>
      ) : null}

      <form action={savePayrollTrmAction} className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-3">
        <input type="hidden" name="mes" value={mesValue} />
        <label className="space-y-1 text-xs text-muted-foreground">
          TRM (pesos por 1 dólar), para los básicos en dólares
          <input name="trm" inputMode="decimal" defaultValue={board.trm ?? ""} placeholder="Ej. 3900" className={`${inputClass} w-40`} />
        </label>
        <button type="submit" className={buttonClass}>Guardar TRM</button>
        {!board.trm ? <span className="text-xs text-amber-700 dark:text-amber-300">Sin TRM no se pueden pasar a pesos los básicos en dólares.</span> : null}
      </form>

      <div className="space-y-3">
        {board.rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Aún no hay nadie en la nómina. Agrega a la primera persona abajo.
          </p>
        ) : null}

        {board.rows.map((row) => (
          <div key={row.userId} className="space-y-3 rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-foreground">{row.name}</h2>
                <p className="text-xs text-muted-foreground">
                  {baseDescription(row, money)}
                  {row.period ? ` · ${PAY_PERIOD_LABELS[row.period]}` : ""}
                  {row.earnsCommission
                    ? row.commissionPct !== null
                      ? ` · comisión fija ${row.commissionPct}%${row.commissionFrom ? ` desde ${row.commissionFrom}` : ""}`
                      : " · comisión 15%"
                    : " · sin comisión"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Falta pagar</p>
                <p className={`text-lg font-bold tabular-nums ${row.pending !== null && row.pending < 0 ? "text-destructive" : "text-foreground"}`}>
                  {row.pending === null ? "—" : money(row.pending)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
              <div className="rounded-md bg-muted/40 px-2.5 py-1.5">
                <p className="text-[11px] text-muted-foreground">
                  Básico del mes
                  {row.period === "QUINCENAL" ? " (2 quincenas)" : row.period === "DIARIO" && row.daysWorked !== null ? ` (${row.daysWorked} días)` : ""}
                </p>
                <p className="tabular-nums font-medium">
                  {row.baseCop === null ? "Sin calcular" : money(row.baseCop)}
                  {row.currency === "USD" && row.baseOriginal ? (
                    <span className="ml-1 text-[11px] text-muted-foreground">(US${row.baseOriginal.toLocaleString("es-CO")})</span>
                  ) : null}
                </p>
              </div>
              <div className="rounded-md bg-muted/40 px-2.5 py-1.5">
                <p className="text-[11px] text-muted-foreground">Comisión ({row.salesCount} venta(s))</p>
                <p className="tabular-nums font-medium">{money(row.commission)}</p>
              </div>
              <div className="rounded-md bg-muted/40 px-2.5 py-1.5">
                <p className="text-[11px] text-muted-foreground">Total del mes</p>
                <p className="tabular-nums font-medium">{row.totalDue === null ? "—" : money(row.totalDue)}</p>
              </div>
              <div className="rounded-md bg-muted/40 px-2.5 py-1.5">
                <p className="text-[11px] text-muted-foreground">Ya pagado</p>
                <p className="tabular-nums font-medium">{money(row.paid)}</p>
              </div>
            </div>

            {row.warnings.length > 0 ? (
              <ul className="space-y-0.5 text-xs text-amber-800 dark:text-amber-200">
                {row.warnings.map((warning) => (
                  <li key={warning} className="flex gap-1.5">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                    {warning}
                  </li>
                ))}
              </ul>
            ) : null}

            {row.period === "DIARIO" ? (
              <form action={savePayrollDaysAction} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="mes" value={mesValue} />
                <input type="hidden" name="userId" value={row.userId} />
                <label className="space-y-1 text-xs text-muted-foreground">
                  Días trabajados en {monthLabel(mes, anio)}
                  <input name="days" inputMode="decimal" defaultValue={row.daysWorked ?? ""} className={`${inputClass} w-28`} />
                </label>
                <button type="submit" className={buttonClass}>Guardar días</button>
              </form>
            ) : null}

            {row.payments.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-xs">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="py-1.5 pr-3 font-medium">Fecha</th>
                      <th className="py-1.5 pr-3 font-medium">Concepto</th>
                      <th className="py-1.5 pr-3 font-medium">Cuenta</th>
                      <th className="py-1.5 text-right font-medium">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {row.payments.map((payment) => (
                      <tr key={payment.id} className="border-b border-border/60">
                        <td className="py-1.5 pr-3 tabular-nums">{payment.date.toISOString().slice(0, 10)}</td>
                        <td className="py-1.5 pr-3">{payment.description ?? "—"}</td>
                        <td className="py-1.5 pr-3">{payment.accountName}</td>
                        <td className="py-1.5 text-right tabular-nums">{money(payment.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {row.earnsCommission ? (
              <form action={regenerateSellerLinkAction} className="flex flex-wrap items-end gap-2 rounded-lg bg-muted/30 p-2.5">
                <input type="hidden" name="mes" value={mesValue} />
                <input type="hidden" name="userId" value={row.userId} />
                {sellerLinks[row.userId] ? (
                  <>
                    <label className="min-w-0 flex-1 space-y-1 text-xs text-muted-foreground">
                      Link de comisiones para enviarle por WhatsApp
                      <input
                        readOnly
                        value={getSiteUrl(`/mis-comisiones/${sellerLinks[row.userId]}`)}
                        className={`${inputClass} font-mono text-xs`}
                      />
                    </label>
                    <CopyButton
                      value={getSiteUrl(`/mis-comisiones/${sellerLinks[row.userId]}`)}
                      label="Copiar"
                      toastText="Link copiado"
                    />
                  </>
                ) : (
                  <>
                    <p className="flex-1 text-xs text-muted-foreground">
                      Crea su link privado: verá sus ventas, su comisión explicada y lo que ganaría con sus cotizaciones.
                    </p>
                    <button type="submit" className={buttonClass}>
                      Crear link
                    </button>
                  </>
                )}
              </form>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <details className="group w-full rounded-lg border border-border p-3 open:bg-muted/20 md:w-auto md:min-w-[420px]">
                <summary className="cursor-pointer text-sm font-medium text-primary">Registrar pago</summary>
                {activeAccounts.length === 0 ? (
                  <p className="mt-2 text-xs text-muted-foreground">Primero crea una cuenta en Balances.</p>
                ) : (
                  <form action={payPayrollAction} className="mt-3 grid gap-2 sm:grid-cols-2">
                    <input type="hidden" name="mes" value={mesValue} />
                    <input type="hidden" name="employeeId" value={row.userId} />
                    <label className="space-y-1 text-xs text-muted-foreground">
                      Valor
                      <input name="amount" inputMode="numeric" required defaultValue={row.pending && row.pending > 0 ? row.pending : ""} className={inputClass} />
                    </label>
                    <label className="space-y-1 text-xs text-muted-foreground">
                      Concepto
                      <select name="concept" className={inputClass} defaultValue={row.period === "SIN_BASE" ? "COMISION" : row.period === "DIARIO" ? "DIAS" : "BASE_Q1"}>
                        <option value="BASE_Q1">Básico 1ª quincena</option>
                        <option value="BASE_Q2">Básico 2ª quincena</option>
                        <option value="DIAS">Días trabajados</option>
                        <option value="COMISION">Comisiones</option>
                        <option value="BASE_Y_COMISION">Básico + comisiones</option>
                        <option value="OTRO">Otro</option>
                      </select>
                    </label>
                    <label className="space-y-1 text-xs text-muted-foreground">
                      Sale de la cuenta
                      <select name="accountId" required className={inputClass} defaultValue="">
                        <option value="" disabled>Elige la cuenta</option>
                        {activeAccounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.name} · {money(account.balance)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1 text-xs text-muted-foreground">
                      Fecha del pago
                      <input type="date" name="date" required defaultValue={today} className={inputClass} />
                    </label>
                    <label className="space-y-1 text-xs text-muted-foreground sm:col-span-2">
                      Nota (opcional)
                      <input name="note" maxLength={300} className={inputClass} />
                    </label>
                    <label className="space-y-1 text-xs text-muted-foreground sm:col-span-2">
                      Comprobante (obligatorio salvo efectivo)
                      <input type="file" name="receipt" accept="image/jpeg,image/png,image/webp,application/pdf" className="block w-full text-xs" />
                    </label>
                    <div className="sm:col-span-2">
                      <button type="submit" className={primaryButtonClass}>Registrar pago</button>
                    </div>
                  </form>
                )}
              </details>

              <details className="w-full rounded-lg border border-border p-3 open:bg-muted/20 md:w-auto md:min-w-[360px]">
                <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
                  {row.configured ? "Editar salario" : "Configurar salario"}
                </summary>
                <PersonForm
                  mesValue={mesValue}
                  userId={row.userId}
                  defaults={{
                    period: row.period ?? "SIN_BASE",
                    currency: row.currency ?? "COP",
                    baseAmount: row.baseAmount,
                    earnsCommission: row.earnsCommission,
                    commissionPct: row.commissionPct,
                    commissionFrom: row.commissionFrom,
                  }}
                />
                {row.configured ? (
                  <form action={removePayrollPersonAction} className="mt-2">
                    <input type="hidden" name="mes" value={mesValue} />
                    <input type="hidden" name="userId" value={row.userId} />
                    <button type="submit" className="text-xs text-destructive hover:underline">Quitar de la nómina</button>
                  </form>
                ) : null}
              </details>
            </div>
          </div>
        ))}
      </div>

      <details className="rounded-xl border border-dashed border-border bg-card p-4">
        <summary className="cursor-pointer text-sm font-semibold text-foreground">Agregar persona a la nómina</summary>
        {unconfiguredStaff.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Todas las personas del equipo ya están en la nómina. Si falta alguien, créala primero en Configuración → Usuarios
            con rol Empleado.
          </p>
        ) : (
          <PersonForm mesValue={mesValue} staff={unconfiguredStaff} defaults={{ period: "QUINCENAL", currency: "COP", baseAmount: 0, earnsCommission: true, commissionPct: null, commissionFrom: null }} />
        )}
      </details>
    </section>
  );
}

function PersonForm({
  mesValue,
  userId,
  staff,
  defaults,
}: {
  mesValue: string;
  userId?: string;
  staff?: { id: string; name: string }[];
  defaults: {
    period: string;
    currency: string;
    baseAmount: number;
    earnsCommission: boolean;
    commissionPct: number | null;
    commissionFrom: string | null;
  };
}) {
  return (
    <form action={savePayrollPersonAction} className="mt-3 grid gap-2 sm:grid-cols-2">
      <input type="hidden" name="mes" value={mesValue} />
      {userId ? (
        <input type="hidden" name="userId" value={userId} />
      ) : (
        <label className="space-y-1 text-xs text-muted-foreground sm:col-span-2">
          Persona
          <select name="userId" required className={inputClass} defaultValue="">
            <option value="" disabled>Elige la persona</option>
            {(staff ?? []).map((member) => (
              <option key={member.id} value={member.id}>{member.name}</option>
            ))}
          </select>
        </label>
      )}
      <label className="space-y-1 text-xs text-muted-foreground">
        Tipo de básico
        <select name="period" className={inputClass} defaultValue={defaults.period}>
          <option value="QUINCENAL">Por quincena</option>
          <option value="DIARIO">Por día trabajado</option>
          <option value="SIN_BASE">Sin básico (solo comisión)</option>
        </select>
      </label>
      <label className="space-y-1 text-xs text-muted-foreground">
        Moneda del básico
        <select name="currency" className={inputClass} defaultValue={defaults.currency}>
          <option value="COP">Pesos (COP)</option>
          <option value="USD">Dólares (USD)</option>
        </select>
      </label>
      <label className="space-y-1 text-xs text-muted-foreground">
        Valor por quincena o por día
        <input name="baseAmount" inputMode="decimal" defaultValue={defaults.baseAmount || ""} placeholder="Ej. 50 o 50000" className={inputClass} />
      </label>
      <label className="flex items-center gap-2 self-end pb-1.5 text-xs text-muted-foreground">
        <input type="checkbox" name="earnsCommission" defaultChecked={defaults.earnsCommission} />
        Gana comisión por ventas
      </label>
      <label className="space-y-1 text-xs text-muted-foreground">
        Comisión fija % (vacío = regla general, 15%)
        <input name="commissionPct" inputMode="decimal" defaultValue={defaults.commissionPct ?? ""} placeholder="Ej. 15" className={inputClass} />
      </label>
      <label className="space-y-1 text-xs text-muted-foreground">
        Comisión fija desde el mes
        <input type="month" name="commissionFrom" defaultValue={defaults.commissionFrom ?? mesValue} className={inputClass} />
      </label>
      <div className="sm:col-span-2">
        <button type="submit" className={primaryButtonClass}>Guardar salario</button>
      </div>
    </form>
  );
}
