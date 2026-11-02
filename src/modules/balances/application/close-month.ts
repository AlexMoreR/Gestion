import { colombiaMonthRange, todayInColombia } from "../../../lib/colombia-time";
import { resolveAccount } from "../../expenses/domain/expense-draft";
import type { AccountType } from "../domain/entities";

// Cierre de mes: el dueno dicta el saldo real (el del banco) de cada cuenta activa y Gestion crea
// UN movimiento manual de ajuste por cuenta con diferencia. Nada se borra: un error se corrige con
// un movimiento contrario desde Balances.

// Una diferencia mayor suele ser un numero mal dictado: hay que confirmarla aparte.
export const CIERRE_TOPE_DIFERENCIA = 1_000_000;

export class MonthCloseInputError extends Error {}

export type CloseAccount = {
  id: string;
  name: string;
  type: AccountType;
  saldoGestion: number;
  // Ya tiene el ajuste de este mes (la nota del cierre): no se le crea otro.
  cerrada: boolean;
};

export type DictatedBalance = { cuenta: string; saldo: number };

export type CloseLine = {
  accountId: string;
  cuenta: string;
  saldoGestion: number;
  saldoReal: number | null;
  diferencia: number;
  accion: "cuadra" | "ajuste" | "ya_cerrada";
  tipo: "IN" | "OUT" | null;
};

export type MonthClosePlan = {
  month: string;
  lines: CloseLine[];
  faltan: string[];
  grandes: CloseLine[];
};

export function closeMonthNote(month: string): string {
  return `Cierre de mes ${month}: cuadre con el banco`;
}

// Ultimo dia del mes, 'AAAA-MM-DD' (dia de calendario).
export function lastDayOfMonth(month: string): string {
  const end = colombiaMonthRange(month).end;
  return new Date(end.getTime() - 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function isLastDayOfMonth(now: Date): boolean {
  const today = todayInColombia(now);
  return lastDayOfMonth(today.slice(0, 7)) === today;
}

function previousMonth(month: string): string {
  const [year, mon] = month.split("-").map(Number);
  return mon === 1 ? `${year - 1}-12` : `${year}-${String(mon - 1).padStart(2, "0")}`;
}

// Mes a cerrar: el que diga el dueno o, si no, el actual si hoy es su ultimo dia y si no el anterior.
// Solo se cierra un mes terminado o el mes en curso en su ultimo dia (si no, su saldo aun cambia).
export function resolveCloseMonth(mes: string | undefined, now: Date): string {
  const today = todayInColombia(now);
  const current = today.slice(0, 7);
  const lastDay = isLastDayOfMonth(now);
  if (!mes) {
    return lastDay ? current : previousMonth(current);
  }
  const value = mes.trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    throw new MonthCloseInputError('"mes" debe tener el formato AAAA-MM (ej. 2026-10).');
  }
  if (value > current || (value === current && !lastDay)) {
    throw new MonthCloseInputError(
      `El mes ${value} aun no termina: solo se cierra un mes terminado o el mes en curso en su ultimo dia.`,
    );
  }
  return value;
}

export function planMonthClose(month: string, accounts: CloseAccount[], saldos: DictatedBalance[]): MonthClosePlan {
  if (saldos.length === 0) {
    throw new MonthCloseInputError("Falta el saldo real de al menos una cuenta.");
  }
  const dictated = new Map<string, number>();
  for (const item of saldos) {
    if (!Number.isFinite(item.saldo)) {
      throw new MonthCloseInputError(`El saldo de "${item.cuenta}" no es un numero valido.`);
    }
    // Solo cuentas activas (la del dueno no es plata del negocio y no esta en la lista).
    const resolved = resolveAccount(item.cuenta, accounts);
    if (!resolved.ok) {
      throw new MonthCloseInputError(resolved.error);
    }
    if (dictated.has(resolved.account.id)) {
      throw new MonthCloseInputError(`La cuenta ${resolved.account.name} viene dos veces: deja un solo saldo.`);
    }
    dictated.set(resolved.account.id, Math.round(item.saldo));
  }

  const lines: CloseLine[] = [];
  const faltan: string[] = [];
  for (const account of accounts) {
    const saldoReal = dictated.get(account.id);
    if (saldoReal === undefined) {
      if (!account.cerrada) faltan.push(account.name);
      continue;
    }
    const diferencia = saldoReal - Math.round(account.saldoGestion);
    const accion = account.cerrada ? "ya_cerrada" : diferencia === 0 ? "cuadra" : "ajuste";
    lines.push({
      accountId: account.id,
      cuenta: account.name,
      saldoGestion: Math.round(account.saldoGestion),
      saldoReal,
      diferencia,
      accion,
      // Faltaba plata en Gestion = entrada; sobraba = salida.
      tipo: accion === "ajuste" ? (diferencia > 0 ? "IN" : "OUT") : null,
    });
  }
  const grandes = lines.filter((line) => line.accion === "ajuste" && Math.abs(line.diferencia) > CIERRE_TOPE_DIFERENCIA);
  return { month, lines, faltan, grandes };
}

function pesos(value: number): string {
  return Math.abs(value).toLocaleString("es-CO", { maximumFractionDigits: 0 });
}

// Una sola linea para el dueno: "Cuadró" o "En X faltaban/sobraban N pesos, ya quedó ajustado".
export function describeCloseResult(plan: MonthClosePlan, done: boolean): string {
  const parts = plan.lines.map((line) => {
    if (line.accion === "ya_cerrada") return `${line.cuenta} ya estaba cerrada este mes`;
    if (line.accion === "cuadra") return null;
    const verbo = line.diferencia > 0 ? (done ? "faltaban" : "faltan") : done ? "sobraban" : "sobran";
    return `En ${line.cuenta} ${verbo} ${pesos(line.diferencia)} pesos, ${done ? "ya quedó ajustado" : "se ajustará"}`;
  });
  const text = parts.filter(Boolean).join("; ") || "Cuadró";
  return plan.faltan.length > 0 ? `${text}. Falta el saldo de: ${plan.faltan.join(", ")}.` : text;
}

export type Adjustment = { accountId: string; type: "IN" | "OUT"; amount: number };
type Actor = { id: string; name?: string | null; email?: string | null };

export type MonthCloseDeps = {
  now: () => Date;
  // Cuentas activas (sin la del dueno) con su saldo en Gestion al cierre del mes.
  loadAccounts: (month: string) => Promise<CloseAccount[]>;
  // Crea los ajustes con candado; omite las cuentas que ya tienen el de este mes. Devuelve las creadas.
  applyAdjustments: (input: {
    month: string;
    note: string;
    movementDate: Date;
    adjustments: Adjustment[];
    createdById: string;
  }) => Promise<string[]>;
  resolveActor: () => Promise<Actor | null>;
  logActivity: (actor: Actor, entry: { month: string; summary: string }) => Promise<void>;
};

export type MonthCloseInput = { mes?: string; saldos: DictatedBalance[]; aceptoDiferenciaGrande?: boolean };

export async function prepareMonthClose(deps: MonthCloseDeps, input: MonthCloseInput): Promise<MonthClosePlan> {
  const month = resolveCloseMonth(input.mes, deps.now());
  const accounts = await deps.loadAccounts(month);
  return planMonthClose(month, accounts, input.saldos);
}

export async function confirmMonthClose(
  deps: MonthCloseDeps,
  input: MonthCloseInput,
): Promise<{ plan: MonthClosePlan; resumen: string }> {
  const plan = await prepareMonthClose(deps, input);
  if (plan.grandes.length > 0 && !input.aceptoDiferenciaGrande) {
    const list = plan.grandes.map((line) => `${line.cuenta} (${pesos(line.diferencia)} pesos)`).join(", ");
    throw new MonthCloseInputError(
      `Diferencia de mas de ${pesos(CIERRE_TOPE_DIFERENCIA)} pesos en ${list}. Confirma con el dueno que el saldo este bien dictado y vuelve a llamar con acepto_diferencia_grande=true.`,
    );
  }
  const actor = await deps.resolveActor();
  if (!actor) {
    throw new MonthCloseInputError("No hay un administrador para registrar el cierre.");
  }
  const adjustments = plan.lines
    .filter((line) => line.accion === "ajuste" && line.tipo)
    .map((line) => ({ accountId: line.accountId, type: line.tipo as "IN" | "OUT", amount: Math.abs(line.diferencia) }));
  const created = new Set(
    adjustments.length > 0
      ? await deps.applyAdjustments({
          month: plan.month,
          note: closeMonthNote(plan.month),
          // Fecha escrita (medianoche UTC) del ultimo dia: cuenta en ese mes.
          movementDate: new Date(`${lastDayOfMonth(plan.month)}T00:00:00.000Z`),
          adjustments,
          createdById: actor.id,
        })
      : [],
  );
  // Si otro cierre se adelanto (doble confirmacion), esa cuenta queda como ya cerrada.
  const lines = plan.lines.map((line) =>
    line.accion === "ajuste" && !created.has(line.accountId) ? { ...line, accion: "ya_cerrada" as const, tipo: null } : line,
  );
  const done = { ...plan, lines };
  const resumen = describeCloseResult(done, true);
  await deps.logActivity(actor, { month: plan.month, summary: `Cierre de mes ${plan.month} (por Claude): ${resumen}` });
  return { plan: done, resumen };
}

// Texto del WhatsApp del ultimo dia: sin los saldos de Gestion, para no sesgar lo que se dicta.
export function buildCloseReminder(month: string, cuentas: string[]): string {
  const [year, mon] = month.split("-").map(Number);
  const label = new Date(Date.UTC(year, mon - 1, 15)).toLocaleDateString("es-CO", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return `Hoy se cierra ${label}. Mándame el saldo real de cada cuenta al final del día (como sale en el banco o en caja): ${cuentas.join(", ")}. Con eso dejo todo cuadrado.`;
}
