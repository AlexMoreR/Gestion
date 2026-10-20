// Registro retroactivo: un registro (venta, abono o gasto) cuya fecha puesta por el usuario
// es un dia calendario de Colombia ANTERIOR al dia de hoy en Colombia. Funciones puras.

export type TipoRetroactivo = "VENTA" | "ABONO" | "GASTO";

export const TIPO_RETROACTIVO_LABEL: Record<TipoRetroactivo, string> = {
  VENTA: "Venta",
  ABONO: "Abono",
  GASTO: "Gasto",
};

export const MOTIVO_MIN = 5;
export const MOTIVO_MAX = 500;
export const MOTIVO_FIELD = "motivoRetroactivo";

const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;
const DIA_RE = /^\d{4}-\d{2}-\d{2}$/;

// Dia calendario en Colombia (UTC-5, sin horario de verano), formato AAAA-MM-DD.
export function diaBogota(fecha: Date): string {
  return new Date(fecha.getTime() - BOGOTA_OFFSET_MS).toISOString().slice(0, 10);
}

// Dia que puso el usuario. Si llega como texto AAAA-MM-DD (lo que manda el formulario) se toma
// tal cual: asi no importa a que hora del servidor se convierta luego a Date.
export function diaPuesto(fechaPuesta: string | Date): string | null {
  if (typeof fechaPuesta === "string") {
    const value = fechaPuesta.trim().slice(0, 10);
    return DIA_RE.test(value) ? value : null;
  }
  return Number.isNaN(fechaPuesta.getTime()) ? null : diaBogota(fechaPuesta);
}

export function esRetroactivo(fechaPuesta: string | Date | null | undefined, ahora: Date = new Date()): boolean {
  if (fechaPuesta == null) return false;
  const dia = diaPuesto(fechaPuesta);
  return dia !== null && dia < diaBogota(ahora);
}

// Dias calendario entre el dia puesto y el dia real del registro (0 si es el mismo dia).
export function diasDeAtraso(fechaPuesta: string | Date, registradoEn: Date): number {
  const dia = diaPuesto(fechaPuesta);
  if (!dia) return 0;
  const desde = Date.parse(`${dia}T00:00:00Z`);
  const hasta = Date.parse(`${diaBogota(registradoEn)}T00:00:00Z`);
  return Math.max(Math.round((hasta - desde) / 86_400_000), 0);
}

// La fecha puesta se guarda a mediodia UTC: cae en el mismo dia en Colombia y en UTC.
export function fechaPuestaParaGuardar(fechaPuesta: string | Date): Date {
  const dia = diaPuesto(fechaPuesta);
  return dia ? new Date(`${dia}T12:00:00Z`) : new Date(NaN);
}

// En una edicion, ¿el dia realmente cambio? Las fechas viejas se guardaron de varias formas
// (medianoche UTC, mediodia del servidor, ahora), asi que el dia anterior se compara contra
// su dia en UTC y en Colombia: si coincide con cualquiera, no hubo cambio.
export function cambioDeDia(nuevoDia: string | Date, fechaAnterior: Date | null | undefined): boolean {
  const nuevo = diaPuesto(nuevoDia);
  if (!nuevo) return false;
  if (!fechaAnterior || Number.isNaN(fechaAnterior.getTime())) return true;
  return nuevo !== fechaAnterior.toISOString().slice(0, 10) && nuevo !== diaBogota(fechaAnterior);
}

// En una edicion se registra retroactivo solo si el dia cambio y quedo antes de hoy.
export function esEdicionRetroactiva(
  nuevoDia: string | Date | null | undefined,
  fechaAnterior: Date | null | undefined,
  ahora: Date = new Date(),
): boolean {
  if (nuevoDia == null) return false;
  return esRetroactivo(nuevoDia, ahora) && cambioDeDia(nuevoDia, fechaAnterior);
}

export type ValidacionMotivo = { ok: true; motivo: string } | { ok: false; error: string };

export function validarMotivo(raw: unknown): ValidacionMotivo {
  const motivo = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  if (motivo.length < MOTIVO_MIN) {
    return { ok: false, error: "La fecha es anterior a hoy: escribe el motivo del registro atrasado." };
  }
  if (motivo.length > MOTIVO_MAX) {
    return { ok: false, error: `El motivo no puede pasar de ${MOTIVO_MAX} caracteres.` };
  }
  return { ok: true, motivo };
}

// Regla completa: si es retroactivo exige motivo valido. Devuelve el motivo (o null si no aplica).
export function exigirMotivoSiRetroactivo(
  retroactivo: boolean,
  raw: unknown,
): { ok: true; motivo: string | null } | { ok: false; error: string } {
  if (!retroactivo) return { ok: true, motivo: null };
  return validarMotivo(raw);
}

// Mes AAAA-MM en Colombia -> rango [desde, hasta) en UTC para filtrar por registradoEn.
export function rangoMesBogota(mes: string | undefined, ahora: Date = new Date()) {
  let valor = diaBogota(ahora).slice(0, 7);
  if (typeof mes === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
    valor = mes;
  }
  const [year, month] = valor.split("-").map(Number);
  const desde = new Date(Date.UTC(year, month - 1, 1) + BOGOTA_OFFSET_MS);
  const hasta = new Date(Date.UTC(year, month, 1) + BOGOTA_OFFSET_MS);
  return { valor, desde, hasta };
}
