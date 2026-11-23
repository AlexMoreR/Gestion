import { colombiaDayKey } from "../../../lib/colombia-time";

// Movimientos de UNA cuenta con su saldo acumulado (herramienta MCP movimientos_de_cuenta).
// Suma lo mismo que el saldo de "Dinero hoy" (listAccountBalances): abonos de clientes con
// cuenta, pagos a proveedoras, fletes y gastos restan/suman y los movimientos manuales IN/OUT
// (un traslado ya viene partido en una fila IN y otra OUT).

export type AccountLedgerOrigin = "abono" | "pago_proveedora" | "flete" | "gasto" | "movimiento";

export type AccountLedgerInput = {
  fecha: Date;
  origen: AccountLedgerOrigin;
  sentido: "entrada" | "salida";
  valor: number;
  // Solo gastos: nombre de la categoría (Nómina sale como «nómina»).
  categoria?: string | null;
  // Solo movimientos: true si es una pata de un traslado entre cuentas.
  traslado?: boolean;
  referencia: string | null;
  nota: string | null;
  registradoPor: string | null;
};

export type AccountLedgerLine = {
  fecha: string;
  tipo: string;
  entrada: number;
  salida: number;
  saldo: number;
  referencia: string | null;
  nota: string | null;
  registrado_por: string;
};

export type AccountLedger = {
  saldo_inicial: number;
  total_entradas: number;
  total_salidas: number;
  saldo_final: number;
  movimientos: number;
  cortado: boolean;
  lineas: AccountLedgerLine[];
};

export const ACCOUNT_LEDGER_MAX_LINES = 500;

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

const round = (value: number) => Math.round(value * 100) / 100;

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function ledgerTypeLabel(row: Pick<AccountLedgerInput, "origen" | "categoria" | "traslado">): string {
  switch (row.origen) {
    case "abono":
      return "abono de cliente";
    case "pago_proveedora":
      return "pago a proveedora";
    case "flete":
      return "flete";
    case "gasto":
      return row.categoria && normalize(row.categoria) === "nomina" ? "nómina" : "gasto";
    case "movimiento":
      return row.traslado ? "movimiento manual (traslado)" : "movimiento manual";
  }
}

/** desde/hasta: AAAA-MM-DD inclusivos, por día de Colombia. Sin desde, arranca del saldo inicial de la cuenta. */
export function buildAccountLedger(
  saldoInicialCuenta: number,
  rows: AccountLedgerInput[],
  range: { desde?: string; hasta?: string } = {},
): AccountLedger {
  for (const value of [range.desde, range.hasta]) {
    if (value !== undefined && !DAY_KEY.test(value)) {
      throw new Error(`Fecha invalida: ${value}. Usa AAAA-MM-DD.`);
    }
  }
  if (range.desde && range.hasta && range.desde > range.hasta) {
    throw new Error("'desde' no puede ser despues de 'hasta'.");
  }

  // Orden estable: misma fecha conserva el orden en que llegaron.
  const sorted = rows
    .map((row, index) => ({ row, index, day: colombiaDayKey(row.fecha) }))
    .sort((a, b) => a.row.fecha.getTime() - b.row.fecha.getTime() || a.index - b.index);

  let saldoInicial = saldoInicialCuenta;
  let saldo = saldoInicialCuenta;
  let totalEntradas = 0;
  let totalSalidas = 0;
  const lineas: AccountLedgerLine[] = [];

  for (const { row, day } of sorted) {
    if (range.hasta && day > range.hasta) continue;
    const signed = row.sentido === "entrada" ? row.valor : -row.valor;
    saldo = round(saldo + signed);
    if (range.desde && day < range.desde) {
      saldoInicial = saldo;
      continue;
    }
    if (row.sentido === "entrada") totalEntradas = round(totalEntradas + row.valor);
    else totalSalidas = round(totalSalidas + row.valor);
    lineas.push({
      fecha: day,
      tipo: ledgerTypeLabel(row),
      entrada: row.sentido === "entrada" ? row.valor : 0,
      salida: row.sentido === "salida" ? row.valor : 0,
      saldo,
      referencia: row.referencia,
      nota: row.nota,
      registrado_por: row.registradoPor ?? "sin dato",
    });
  }

  const cortado = lineas.length > ACCOUNT_LEDGER_MAX_LINES;
  return {
    saldo_inicial: round(saldoInicial),
    total_entradas: totalEntradas,
    total_salidas: totalSalidas,
    saldo_final: round(saldoInicial + totalEntradas - totalSalidas),
    movimientos: lineas.length,
    cortado,
    // Se muestran las más nuevas; los totales cuentan todo.
    lineas: cortado ? lineas.slice(-ACCOUNT_LEDGER_MAX_LINES) : lineas,
  };
}

/** Busca una cuenta por nombre sin tildes ni mayúsculas: «nequi» encuentra «2-Nequi». Exacta primero; si el pedazo calza con varias, ninguna. */
export function findAccountByName<T extends { name: string }>(accounts: T[], query: string): T | null {
  const wanted = normalize(query);
  if (!wanted) return null;
  const exact = accounts.find((account) => normalize(account.name) === wanted);
  if (exact) return exact;
  const partial = accounts.filter((account) => normalize(account.name).includes(wanted));
  return partial.length === 1 ? partial[0] : null;
}
