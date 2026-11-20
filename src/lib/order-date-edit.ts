// «Editar orden»: la fecha de la orden solo se toca si la persona la cambió de verdad, y antes de
// mover los abonos de la venta se le muestra cuántos y de qué mes a qué mes (y lo confirma).
// Sin dependencias de Next para que Vitest lo pruebe directo.
import { colombiaDayKey } from "./colombia-time";

/** Campo del formulario con el que la persona confirma que también se mueven los abonos. */
export const CONFIRMAR_FECHA_ABONOS_FIELD = "confirmarFechaAbonos";

export const FALTA_CONFIRMAR_FECHA_ABONOS =
  "Cambiar la fecha de la orden también cambia la fecha de los abonos: marca la casilla para confirmarlo.";

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** ¿El día puesto (AAAA-MM-DD) es otro que el que ya tiene la orden (en hora Colombia)? */
export function fechaDeOrdenCambio(diaPuesto: string, fechaActual: Date): boolean {
  return diaPuesto.trim() !== "" && diaPuesto.trim() !== colombiaDayKey(fechaActual);
}

/** Días (AAAA-MM-DD) de los abonos que la nueva fecha movería: los que no están ya en ese día. */
export function abonosQueCambian(diasAbonos: string[], nuevoDia: string): string[] {
  return diasAbonos.filter((dia) => dia !== nuevoDia);
}

function nombreMes(mes: string, conAnio: boolean): string {
  const nombre = MESES[Number(mes.slice(5, 7)) - 1] ?? mes;
  return conAnio ? `${nombre} de ${mes.slice(0, 4)}` : nombre;
}

function unirConY(partes: string[]): string {
  return partes.length <= 1 ? partes.join("") : `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
}

/**
 * Aviso antes de guardar: «Esto también cambia la fecha de N abonos (de octubre a noviembre)».
 * null si ningún abono cambia de día (o la venta no tiene abonos).
 */
export function avisoFechaAbonos(diasAbonos: string[], nuevoDia: string): string | null {
  const cambian = abonosQueCambian(diasAbonos, nuevoDia);
  if (cambian.length === 0) return null;
  const mesesOrigen = [...new Set(cambian.map((dia) => dia.slice(0, 7)))].sort();
  const mesDestino = nuevoDia.slice(0, 7);
  // El año solo se escribe si no todos los meses son del mismo año.
  const conAnio = [...mesesOrigen, mesDestino].some((mes) => mes.slice(0, 4) !== mesDestino.slice(0, 4));
  const n = cambian.length;
  return `Esto también cambia la fecha de ${n} ${n === 1 ? "abono" : "abonos"} (de ${unirConY(
    mesesOrigen.map((mes) => nombreMes(mes, conAnio)),
  )} a ${nombreMes(mesDestino, conAnio)})`;
}
