// Cierre de mes: el dueno dicta el saldo real (el del banco) de cada cuenta activa y Gestion
// deja UN movimiento de ajuste por cuenta para que cuadre. Nunca borra nada: un ajuste
// equivocado se corrige con un movimiento contrario desde Balances.
// Las reglas son puras; lo que toca la base entra por MonthCloseDeps.

import { todayInColombia } from "../../../lib/colombia-time";
import { formatCop } from "../../expenses/domain/receipt-check";

export class MonthCloseInputError extends Error {}

// Diferencia que se ajusta sin preguntar de nuevo. Mas alto suele ser un error al dictar.
export const CLOSE_BIG_DIFFERENCE = 5_000_000;

export type CloseAccount = { id: string; name: string; balance: number };
export type DictatedBalance = { cuenta: string; saldo: number };

export type CloseLine = {
  accountId: string;
  name: string;
  gestion: number;
  banco: number;
  // banco - gestion: positivo = en Gestion faltaba plata (entra), negativo = sobraba (sale).
  diferencia: number;
  estado: "cuadro" | "ajuste" | "ya_cerrada";
};

export type ClosePlan = {
  monthKey: string;
  note: string;
  movementDay: string;
  lines: CloseLine[];
  faltan: string[];
  grandes: string[];
};

export function closingNote(monthKey: string): string {
  return `Cierre de mes ${monthKey}: cuadre con el banco`;
}

export function lastDayOfMonth(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  const day = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${monthKey}-${String(day).padStart(2, "0")}`;
}

export function isLastDayOfMonth(today: string): boolean {
  return lastDayOfMonth(today.slice(0, 7)) === today;
}

function previousMonthKey(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;
}

// Mes que se cierra: el actual si hoy es su ultimo dia; si no, el anterior. Solo esos dos,
// para no ajustar meses viejos por error.
export function resolveCloseMonth(requested: string | undefined, today: string = todayInColombia()): string {
  const current = today.slice(0, 7);
  const fallback = isLastDayOfMonth(today) ? current : previousMonthKey(current);
  if (!requested?.trim()) return fallback;
  const monthKey = requested.trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) {
    throw new MonthCloseInputError("El mes va en formato AAAA-MM, ej. 2026-10.");
  }
  if (monthKey === current && !isLastDayOfMonth(today)) {
    throw new MonthCloseInputError(`El mes ${monthKey} todavia no termina: se cierra su ultimo dia (${lastDayOfMonth(monthKey)}).`);
  }
  if (monthKey !== current && monthKey !== previousMonthKey(current)) {
    throw new MonthCloseInputError(`Solo se puede cerrar el mes actual (su ultimo dia) o el anterior (${previousMonthKey(current)}).`);
  }
  return monthKey;
}

function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Nombre exacto (sin tildes ni mayusculas); si no, la unica cuenta cuyo nombre lo contiene.
function matchAccount(accounts: CloseAccount[], text: string): CloseAccount {
  const key = normalizeName(text);
  const exact = accounts.find((account) => normalizeName(account.name) === key);
  if (exact) return exact;
  const partial = key ? accounts.filter((account) => normalizeName(account.name).includes(key)) : [];
  if (partial.length === 1) return partial[0];
  const names = accounts.map((account) => account.name).join(", ");
  if (partial.length > 1) {
    throw new MonthCloseInputError(`"${text}" coincide con varias cuentas (${partial.map((a) => a.name).join(", ")}). Di el nombre exacto.`);
  }
  throw new MonthCloseInputError(`No hay una cuenta activa llamada "${text}". Cuentas activas: ${names || "ninguna"}.`);
}

export function planMonthClose(input: {
  monthKey: string;
  accounts: CloseAccount[];
  dictated: DictatedBalance[];
  closedAccountIds: Set<string>;
}): ClosePlan {
  if (input.dictated.length === 0) {
    throw new MonthCloseInputError("Falta el saldo real de al menos una cuenta.");
  }
  const seen = new Set<string>();
  const lines: CloseLine[] = input.dictated.map((item) => {
    const account = matchAccount(input.accounts, item.cuenta);
    if (seen.has(account.id)) {
      throw new MonthCloseInputError(`La cuenta ${account.name} viene dos veces.`);
    }
    seen.add(account.id);
    const banco = Math.round(item.saldo);
    const gestion = Math.round(account.balance);
    const diferencia = banco - gestion;
    const estado = input.closedAccountIds.has(account.id) ? "ya_cerrada" : diferencia === 0 ? "cuadro" : "ajuste";
    return { accountId: account.id, name: account.name, gestion, banco, diferencia, estado };
  });
  return {
    monthKey: input.monthKey,
    note: closingNote(input.monthKey),
    movementDay: lastDayOfMonth(input.monthKey),
    lines,
    faltan: input.accounts.filter((account) => !seen.has(account.id)).map((account) => account.name),
    grandes: lines
      .filter((line) => line.estado === "ajuste" && Math.abs(line.diferencia) > CLOSE_BIG_DIFFERENCE)
      .map((line) => line.name),
  };
}

// La respuesta en una linea: "Cuadró" o "En X faltaban N pesos, ya quedó ajustado".
export function describeMonthClose(plan: ClosePlan, saved: boolean): string {
  const adjustments = plan.lines.filter((line) => line.estado === "ajuste");
  const closed = plan.lines.filter((line) => line.estado === "ya_cerrada").map((line) => line.name);
  const parts: string[] = [];
  if (adjustments.length === 0) {
    parts.push(closed.length === plan.lines.length ? `${closed.join(", ")}: ya cerrado este mes, no se tocó` : saved ? "Cuadró" : "Cuadra");
  } else {
    const detail = adjustments
      .map((line) => `en ${line.name} ${line.diferencia > 0 ? (saved ? "faltaban" : "faltan") : saved ? "sobraban" : "sobran"} ${formatCop(Math.abs(line.diferencia))}`)
      .join(", ");
    parts.push(`${detail.charAt(0).toUpperCase()}${detail.slice(1)}, ${saved ? "ya quedó ajustado" : "al confirmar se ajusta"}`);
    if (closed.length > 0 && closed.length < plan.lines.length) parts.push(`${closed.join(", ")}: ya cerrado este mes`);
  }
  if (plan.faltan.length > 0) parts.push(`falta el saldo de ${plan.faltan.join(", ")}`);
  return `${parts.join("; ")}.`;
}

export type CloseAdjustment = { accountId: string; type: "IN" | "OUT"; amount: number; summary: string };

export type MonthCloseDeps = {
  // Cuentas activas del negocio con su saldo de hoy en Gestion (sin la del dueno).
  loadAccounts: () => Promise<CloseAccount[]>;
  // Cuentas ya cerradas ese mes (ajuste con la nota o cierre en la bitacora).
  findClosedAccountIds: (monthKey: string) => Promise<Set<string>>;
  // Guarda ajustes y bitacora en una transaccion con candado; devuelve las cuentas que otro
  // cierre alcanzo a cerrar antes (no se tocan).
  saveClose: (input: {
    monthKey: string;
    note: string;
    movementDate: Date;
    accountIds: string[];
    adjustments: CloseAdjustment[];
  }) => Promise<{ skippedAccountIds: string[] }>;
};

export async function prepareMonthClose(
  deps: MonthCloseDeps,
  input: { mes?: string; saldos: DictatedBalance[] },
  today?: string,
): Promise<ClosePlan> {
  const monthKey = resolveCloseMonth(input.mes, today);
  const [accounts, closedAccountIds] = await Promise.all([deps.loadAccounts(), deps.findClosedAccountIds(monthKey)]);
  return planMonthClose({ monthKey, accounts, dictated: input.saldos, closedAccountIds });
}

export async function confirmMonthClose(
  deps: MonthCloseDeps,
  input: { mes?: string; saldos: DictatedBalance[]; confirmarDiferenciaGrande?: boolean },
  today?: string,
): Promise<ClosePlan> {
  const plan = await prepareMonthClose(deps, input, today);
  if (plan.grandes.length > 0 && !input.confirmarDiferenciaGrande) {
    throw new MonthCloseInputError(
      `La diferencia en ${plan.grandes.join(", ")} pasa de ${formatCop(CLOSE_BIG_DIFFERENCE)}: revisa el saldo dictado y, si esta bien, confirma con confirmar_diferencia_grande=true.`,
    );
  }
  const open = plan.lines.filter((line) => line.estado !== "ya_cerrada");
  if (open.length === 0) return plan;
  const { skippedAccountIds } = await deps.saveClose({
    monthKey: plan.monthKey,
    note: plan.note,
    // Fecha escrita (medianoche UTC) = el ultimo dia del mes tal cual.
    movementDate: new Date(`${plan.movementDay}T00:00:00.000Z`),
    accountIds: open.map((line) => line.accountId),
    adjustments: open
      .filter((line) => line.estado === "ajuste")
      .map((line) => ({
        accountId: line.accountId,
        type: line.diferencia > 0 ? "IN" : "OUT",
        amount: Math.abs(line.diferencia),
        summary: `${plan.note}: ${line.name} en Gestion ${formatCop(line.gestion)}, en el banco ${formatCop(line.banco)}`,
      })),
  });
  const skipped = new Set(skippedAccountIds);
  return {
    ...plan,
    lines: plan.lines.map((line) => (skipped.has(line.accountId) ? { ...line, estado: "ya_cerrada" } : line)),
  };
}

// Texto del WhatsApp del ultimo dia (lo manda el CRM por la linea Admin).
export function closeReminderMessage(monthKey: string, accountNames: string[]): string {
  return `Hoy cierra el mes ${monthKey}. Mándame el saldo real de cada cuenta, como lo ves en el banco: ${accountNames.join(", ")}. Si quieres, díctaselo a Claude.`;
}
