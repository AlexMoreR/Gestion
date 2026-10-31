// Cierre de mes: el dueno dicta el saldo real de cada cuenta (lo que dice el banco) y Gestion
// deja UN movimiento manual de ajuste por cuenta para cuadrar. Nada se borra: un error se corrige
// con un movimiento contrario. Imports relativos (Vitest no resuelve el alias "@/").
import { ahoraBogota } from "../../../lib/corte-mes";
import { resolveAccount, type AccountOption } from "../../expenses/domain/expense-draft";

// Un ajuste mayor a esto suele ser un numero mal dictado: se pide confirmarlo aparte.
export const CIERRE_TOPE_AJUSTE = 5_000_000;
const MES_RE = /^(\d{4})-(\d{2})$/;

export class CierreInputError extends Error {}

// entityId de la bitacora que marca un mes como cerrado.
export function marcaCierre(mes: string): string {
  return `cierre-mes:${mes}`;
}

export function notaCierre(mes: string): string {
  return `Cierre de mes ${mes}: cuadre con el banco`;
}

export function mesEnCursoBogota(now: Date = new Date()): string {
  return ahoraBogota(now).toISOString().slice(0, 7);
}

// ¿Hoy es el ultimo dia del mes en Colombia? (el dia del aviso)
export function esUltimoDiaDelMes(now: Date = new Date()): boolean {
  const manana = new Date(ahoraBogota(now).getTime() + 24 * 60 * 60 * 1000);
  return manana.getUTCDate() === 1;
}

// Rango de calendario del mes y fecha del ajuste (ultimo dia, a mediodia UTC: mismo dia en Colombia).
export function periodoDelMes(mes: string, now: Date = new Date()) {
  const match = MES_RE.exec(mes);
  const year = Number(match?.[1]);
  const month = Number(match?.[2]);
  if (!match || month < 1 || month > 12) {
    throw new CierreInputError(`"mes" debe tener el formato AAAA-MM (ej. 2026-11): ${mes}.`);
  }
  if (mes > mesEnCursoBogota(now)) {
    throw new CierreInputError(`El mes ${mes} todavia no empieza: no se puede cerrar.`);
  }
  return {
    period: { from: new Date(Date.UTC(year, month - 1, 1)), to: new Date(Date.UTC(year, month, 1)) },
    fechaAjuste: new Date(Date.UTC(year, month, 0, 12)),
  };
}

export type CuentaParaCierre = AccountOption & { balance: number };
export type SaldoDictado = { cuenta: string; saldo: number };

export type LineaCierre = {
  cuentaId: string;
  cuenta: string;
  saldoGestion: number;
  saldoReal: number;
  // real - Gestion: positivo = en Gestion faltaba plata (ajuste IN); negativo = sobraba (OUT).
  diferencia: number;
  ajuste: { type: "IN" | "OUT"; amount: number } | null;
  yaCerrada: boolean;
};

const redondear = (value: number) => Math.round(value * 100) / 100;
const pesos = (value: number) => new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(value);

// Compara lo dictado con el saldo de Gestion. Lanza CierreInputError si algo no cuadra con las
// cuentas (no existe, esta inactiva, ambigua o repetida): en ese caso no se guarda nada.
export function planearCierre(input: {
  cuentas: CuentaParaCierre[]; // solo cuentas activas
  dictados: SaldoDictado[];
  cerradas: Set<string>; // ids de cuentas que ya tienen el ajuste de este mes
}): LineaCierre[] {
  if (input.dictados.length === 0) {
    throw new CierreInputError("Falta el saldo real de al menos una cuenta.");
  }
  const vistas = new Set<string>();
  return input.dictados.map((dictado) => {
    const resolved = resolveAccount(dictado.cuenta, input.cuentas);
    if (!resolved.ok) throw new CierreInputError(resolved.error);
    const cuenta = input.cuentas.find((item) => item.id === resolved.account.id)!;
    if (vistas.has(cuenta.id)) {
      throw new CierreInputError(`La cuenta ${cuenta.name} viene dos veces: deja un solo saldo por cuenta.`);
    }
    vistas.add(cuenta.id);
    const diferencia = redondear(dictado.saldo - cuenta.balance);
    const yaCerrada = input.cerradas.has(cuenta.id);
    return {
      cuentaId: cuenta.id,
      cuenta: cuenta.name,
      saldoGestion: redondear(cuenta.balance),
      saldoReal: redondear(dictado.saldo),
      diferencia,
      ajuste: yaCerrada || diferencia === 0 ? null : { type: diferencia > 0 ? "IN" : "OUT", amount: Math.abs(diferencia) },
      yaCerrada,
    };
  });
}

export function ajustesGrandes(lineas: LineaCierre[]): LineaCierre[] {
  return lineas.filter((linea) => linea.ajuste && linea.ajuste.amount > CIERRE_TOPE_AJUSTE);
}

// La respuesta al dueno, en una linea.
export function resumirCierre(lineas: LineaCierre[], guardado: boolean): string {
  const partes = lineas
    .filter((linea) => !linea.yaCerrada && linea.ajuste)
    .map((linea) => `En ${linea.cuenta} ${linea.diferencia > 0 ? "faltaban" : "sobraban"} ${pesos(Math.abs(linea.diferencia))} pesos`);
  const cerradas = lineas.filter((linea) => linea.yaCerrada).map((linea) => linea.cuenta);
  const nota = cerradas.length > 0 ? ` (${cerradas.join(", ")} ya estaba cerrada este mes; no se toco)` : "";
  if (partes.length === 0) return `Cuadró${nota}.`;
  return `${partes.join("; ")}, ${guardado ? "ya quedó ajustado" : "se ajusta al confirmar"}${nota}.`;
}

// Texto del aviso del ultimo dia (lo envia el CRM por la linea Admin).
export function mensajeAvisoCierre(mes: string, cuentas: string[]): string {
  return `Hola Alexander, hoy se cierra el mes ${mes}. Mándame el saldo real de cada cuenta (lo que dice el banco o la caja): ${cuentas.join(", ")}.`;
}

export type CierreDeps = {
  listarCuentas: (period: { from: Date; to: Date }) => Promise<CuentaParaCierre[]>;
  cuentasCerradas: (nota: string) => Promise<Set<string>>;
  // Crea el ajuste solo si la cuenta no tiene ya uno con esta nota (candado por cuenta).
  // Devuelve false si ya existia.
  crearAjuste: (input: { accountId: string; type: "IN" | "OUT"; amount: number; note: string; movementDate: Date }) => Promise<boolean>;
  // Queda siempre (aunque cuadre): asi se sabe que el mes ya se cerro.
  bitacora: (mes: string, summary: string) => Promise<void>;
};

export async function cerrarMes(
  deps: CierreDeps,
  input: { mes: string; dictados: SaldoDictado[]; confirmado: boolean; aceptoAjusteGrande: boolean },
  now: Date = new Date(),
) {
  const { period, fechaAjuste } = periodoDelMes(input.mes, now);
  const nota = notaCierre(input.mes);
  const [cuentas, cerradas] = await Promise.all([deps.listarCuentas(period), deps.cuentasCerradas(nota)]);
  const lineas = planearCierre({ cuentas, dictados: input.dictados, cerradas });
  const grandes = ajustesGrandes(lineas);
  const faltan = cuentas.filter((cuenta) => !lineas.some((linea) => linea.cuentaId === cuenta.id)).map((c) => c.name);

  if (!input.confirmado || (grandes.length > 0 && !input.aceptoAjusteGrande)) {
    return { guardado: false, lineas, grandes, faltan, resumen: resumirCierre(lineas, false) };
  }

  for (const linea of lineas) {
    if (!linea.ajuste) continue;
    const creado = await deps.crearAjuste({ accountId: linea.cuentaId, ...linea.ajuste, note: nota, movementDate: fechaAjuste });
    if (!creado) {
      linea.yaCerrada = true;
      linea.ajuste = null;
    }
  }
  const resumen = resumirCierre(lineas, true);
  await deps.bitacora(input.mes, `${nota}. ${resumen} (por Claude)`);
  return { guardado: true, lineas, grandes, faltan, resumen };
}
