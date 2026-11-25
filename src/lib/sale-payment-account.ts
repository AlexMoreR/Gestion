// Cambiar la cuenta de un abono: regla pura (sin base) de qué se rechaza antes de guardar.
// El saldo de cada cuenta sale de sumar sus abonos, así que basta con cambiar SalePayment.accountId.

export const MOTIVO_CAMBIO_CUENTA_ERROR = "Escribe el motivo (mínimo 3 letras)";

type AbonoCuenta = { accountId: string | null; isWithholding: boolean };
type CuentaDestino = { id: string; isActive: boolean; type: string };

export function errorCambioCuentaAbono(input: {
  abono: AbonoCuenta | null;
  cuentaNueva: CuentaDestino | null;
  motivo: string;
}): string | null {
  const { abono, cuentaNueva } = input;
  if (!abono) return "No se encontró el abono";
  if (abono.isWithholding) return "La retención en la fuente no está en ninguna cuenta";
  if (input.motivo.trim().length < 3) return MOTIVO_CAMBIO_CUENTA_ERROR;
  if (!cuentaNueva || !cuentaNueva.isActive) return "Elige una cuenta activa";
  if (cuentaNueva.type === "OWNER") return "Los abonos no van a Aportes del dueño";
  if (cuentaNueva.id === abono.accountId) return "El abono ya está en esa cuenta";
  return null;
}
