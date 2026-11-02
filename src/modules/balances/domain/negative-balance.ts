import { formatMoney } from "../../../lib/currency";

// Aviso que se suma al mensaje de "registrado" cuando una salida deja la cuenta bajo cero.
// No bloquea nada: el registro ya se guardó.
export function negativeBalanceNotice(nombreCuenta: string, saldo: number): string {
  if (!(saldo < 0)) return "";
  return `Ojo: ${nombreCuenta} quedó en −${formatMoney(Math.abs(saldo), "COP")}`;
}
