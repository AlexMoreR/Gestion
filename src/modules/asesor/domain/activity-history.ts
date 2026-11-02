// Bitacora para el asesor (historial_de_registro): cada entrada de ActivityLog o de
// OrderStatusHistory en una linea sencilla. Funciones puras; imports relativos por Vitest.
import { colombiaDayKey, colombiaTimeOfDay } from "../../../lib/colombia-time";

export type ActivityHistoryRow =
  | {
      kind: "actividad";
      at: Date;
      persona: string;
      origin: string | null;
      summary: string;
      before: unknown;
      after: unknown;
      ticket: string | null;
      commitSha: string | null;
    }
  | {
      kind: "estado";
      at: Date;
      persona: string;
      orderCode: string;
      fromStatus: string | null;
      toStatus: string;
      note: string | null;
    };

// Igual que listar_retroactivos: la lista se corta en 500 filas.
export const MAX_HISTORIAL = 500;
// Antes/despues: solo los campos que cambiaron, cortado a este largo por entrada.
const MAX_CAMBIOS = 300;

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const ORIGEN: Record<string, string> = {
  PANTALLA: "pantalla",
  MCP: "Claude",
  CRM: "CRM",
  SCRIPT: "script",
  MIGRACION: "migración",
  COORDINADOR: "Coordinador",
};

const ESTADO: Record<string, string> = {
  DRAFT: "Borrador",
  RELEASED: "Liberada",
  IN_PRODUCTION: "En producción",
  READY_FOR_DISPATCH: "Lista para despacho",
  DISPATCHED: "Despachada",
  COMPLETED: "Completada",
  CANCELLED: "Cancelada",
};

/** "30-oct 9:04 a. m." en hora de Colombia. */
export function formatColombiaMoment(date: Date): string {
  const [, mes, dia] = colombiaDayKey(date).split("-").map(Number);
  const [h, m] = colombiaTimeOfDay(date).split(":").map(Number);
  const hora12 = h % 12 === 0 ? 12 : h % 12;
  return `${dia}-${MESES[mes - 1]} ${hora12}:${String(m).padStart(2, "0")} ${h < 12 ? "a. m." : "p. m."}`;
}

const esObjeto = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const texto = (value: unknown) => (typeof value === "string" ? value : JSON.stringify(value) ?? "null");

const listar = (obj: Record<string, unknown>, campos: string[]) =>
  campos.map((campo) => `${campo}: ${texto(obj[campo])}`).join(", ");

// "antes …, después …" con solo los campos que cambiaron (o todo si solo hay uno de los dos).
function describirCambios(before: unknown, after: unknown): string {
  const hayAntes = before !== null && before !== undefined;
  const hayDespues = after !== null && after !== undefined;
  let out = "";
  if (esObjeto(before) && esObjeto(after)) {
    const campos = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
      (campo) => texto(before[campo]) !== texto(after[campo]),
    );
    if (campos.length) out = `antes ${listar(before, campos)}; después ${listar(after, campos)}`;
  } else if (hayAntes && hayDespues) {
    out = `antes ${texto(before)}; después ${texto(after)}`;
  } else if (hayAntes) {
    out = `antes ${esObjeto(before) ? listar(before, Object.keys(before)) : texto(before)}`;
  } else if (hayDespues) {
    out = `después ${esObjeto(after) ? listar(after, Object.keys(after)) : texto(after)}`;
  }
  return out.length > MAX_CAMBIOS ? `${out.slice(0, MAX_CAMBIOS - 1)}…` : out;
}

const minuscula = (frase: string) => frase.charAt(0).toLowerCase() + frase.slice(1);

/** "30-oct 9:04 a. m. — Fulana (pantalla) editó la compra COM-00010: antes …; después …". */
export function formatActivityLine(row: ActivityHistoryRow): string {
  const cuando = formatColombiaMoment(row.at);
  if (row.kind === "estado") {
    const de = row.fromStatus ? ` de ${ESTADO[row.fromStatus] ?? row.fromStatus}` : "";
    const nota = row.note?.trim() ? ` (${row.note.trim()})` : "";
    return `${cuando} — ${row.persona} cambió la ${row.orderCode}${de} a ${ESTADO[row.toStatus] ?? row.toStatus}${nota}`;
  }
  const origen = row.origin ? (ORIGEN[row.origin] ?? row.origin.toLowerCase()) : "pantalla";
  const cambios = describirCambios(row.before, row.after);
  const firma = [row.ticket ? `tarjeta ${row.ticket}` : "", row.commitSha ? `commit ${row.commitSha.slice(0, 7)}` : ""]
    .filter(Boolean)
    .join(", ");
  return `${cuando} — ${row.persona} (${origen}) ${minuscula(row.summary.trim())}${cambios ? `: ${cambios}` : ""}${
    firma ? ` [${firma}]` : ""
  }`;
}

/** Lineas de lo mas viejo a lo mas nuevo, cortadas en MAX_HISTORIAL. */
export function buildActivityHistory(rows: ActivityHistoryRow[], consulta: string) {
  const ordenadas = [...rows].sort((a, b) => a.at.getTime() - b.at.getTime());
  const lineas = ordenadas.slice(0, MAX_HISTORIAL).map(formatActivityLine);
  return {
    consulta,
    total: ordenadas.length,
    mostrados: lineas.length,
    lineas,
    ...(lineas.length ? {} : { aviso: `La bitácora no tiene registros de ${consulta}.` }),
    nota: "De lo más viejo a lo más nuevo, en hora de Colombia. Origen: pantalla, Claude, CRM, script o migración (sin dato = pantalla). Antes/después: solo los campos que cambiaron. Las entradas viejas (antes de oct-2026) pueden no tener antes/después. Solo lectura.",
  };
}
