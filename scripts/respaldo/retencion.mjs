// Regla de borrado de los respaldos de Gestion.
// Decide, a partir de una lista de nombres de archivo, cuales son respaldos de mas de N dias.
// Solo considera respaldo un nombre exacto "gestion-AAAA-MM-DD_HHMM.dump": cualquier otro archivo
// (factura.pdf, un .dump con otro nombre, un parcial) NUNCA se marca para borrar.
//
// Uso desde bash: los nombres entran por stdin (uno por linea) y salen por stdout los que se borran.
//   ls /opt/respaldos/gestion | node retencion.mjs --dias 30
//   (opcional --hoy AAAA-MM-DD para fijar el dia; por defecto, hoy en Colombia)
import path from "node:path";

export const BACKUP_NAME_RE = /^gestion-(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})\.dump$/;
export const DEFAULT_KEEP_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

// Fecha de calendario (dias desde 1970) de un "AAAA-MM-DD", o null si no es una fecha real.
function calendarDay(year, month, day) {
  const ms = Date.UTC(year, month - 1, day);
  const check = new Date(ms);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return Math.round(ms / DAY_MS);
}

// Datos del respaldo segun su nombre, o null si el archivo no es un respaldo.
export function parseBackupName(name) {
  const match = BACKUP_NAME_RE.exec(String(name ?? "").trim());
  if (!match) return null;
  const [, y, m, d, hh, mm] = match.map(Number);
  if (hh > 23 || mm > 59) return null;
  const day = calendarDay(y, m, d);
  if (day === null) return null;
  return { name: match[0], day, minutes: hh * 60 + mm };
}

// "AAAA-MM-DD" del dia de hoy en Colombia (el nombre del respaldo usa la hora de Bogota).
export function todayInBogota(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function parseDayString(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ""));
  if (!match) return null;
  return calendarDay(Number(match[1]), Number(match[2]), Number(match[3]));
}

// Nombres a borrar: respaldos con mas de `keepDays` dias de antiguedad respecto a `today`.
// Un respaldo de exactamente `keepDays` dias se guarda. El respaldo mas reciente nunca se borra,
// aunque sea viejo (si el respaldo nuevo fallo, no se queda sin ninguna copia).
export function selectBackupsToDelete(names, { today, keepDays = DEFAULT_KEEP_DAYS } = {}) {
  if (!Number.isInteger(keepDays) || keepDays < 1) throw new Error(`Dias a guardar invalidos: ${keepDays}`);
  const todayDay = parseDayString(today);
  if (todayDay === null) throw new Error(`Fecha de hoy invalida: ${today}`);

  const backups = [];
  const seen = new Set();
  for (const name of names) {
    const parsed = parseBackupName(name);
    if (!parsed || seen.has(parsed.name)) continue;
    seen.add(parsed.name);
    backups.push(parsed);
  }
  if (backups.length === 0) return [];

  const newest = backups.reduce((a, b) => (b.day > a.day || (b.day === a.day && b.minutes > a.minutes) ? b : a));
  return backups
    .filter((b) => b !== newest && todayDay - b.day > keepDays)
    .sort((a, b) => a.day - b.day || a.minutes - b.minutes)
    .map((b) => b.name);
}

function readArg(args, flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

async function readStdin() {
  let data = "";
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

async function main() {
  const args = process.argv.slice(2);
  const keepDays = Number(readArg(args, "--dias") ?? DEFAULT_KEEP_DAYS);
  const today = readArg(args, "--hoy") ?? todayInBogota();
  const names = (await readStdin()).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const name of selectBackupsToDelete(names, { today, keepDays })) console.log(name);
}

// Se ejecuta solo como programa (no al importarlo en las pruebas).
const isEntry = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (isEntry && !process.env.VITEST) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
