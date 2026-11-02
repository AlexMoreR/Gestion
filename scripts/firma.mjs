// Firma de los scripts que cambian datos: con --aplicar exigen --tarjeta T-xxx y, al escribir,
// dejan una fila en ActivityLog con origin "SCRIPT", la tarjeta y el commit.
// Regla de CLAUDE.md: ningun arreglo tecnico escribe datos sin decir de que tarjeta y commit sale.
import { execSync } from "node:child_process";

const TARJETA = /^T-[A-Za-z0-9]+$/;

/** La tarjeta de `--tarjeta T-xxx` o `--tarjeta=T-xxx`; null si falta o no tiene esa forma. */
export function leerTarjeta(argv) {
  const i = argv.indexOf("--tarjeta");
  const valor = i >= 0 ? argv[i + 1] : argv.find((arg) => arg.startsWith("--tarjeta="))?.slice("--tarjeta=".length);
  return valor && TARJETA.test(valor) ? valor : null;
}

/**
 * Llamar ANTES de conectarse a la base. En simulacion (sin --aplicar) no exige nada y devuelve null.
 * Con --aplicar y sin tarjeta valida, termina el proceso con error.
 */
export function exigirTarjeta(argv = process.argv) {
  if (!argv.includes("--aplicar")) return null;
  const tarjeta = leerTarjeta(argv);
  if (!tarjeta) {
    console.error("Falta --tarjeta T-xxx: con --aplicar, todo script que cambia datos firma con su tarjeta. No se escribió nada.");
    process.exit(1);
  }
  return tarjeta;
}

/** Commit del codigo que corre: GIT_COMMIT o `git rev-parse HEAD`; null si no hay git. */
export function commitActual() {
  if (process.env.GIT_COMMIT?.trim()) return process.env.GIT_COMMIT.trim();
  try {
    return execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || null;
  } catch {
    return null;
  }
}

/**
 * Deja la fila de firma en la bitacora. `db` puede ser el cliente de Prisma o una transaccion.
 * Sin usuario (el script no tiene sesion): el autor es "Script <nombre>".
 * @param {{ activityLog: { create: Function } }} db
 * @param {{ script: string, tarjeta: string, resumen: string, entityCode?: string | null, after?: unknown }} firma
 */
export function firmar(db, { script, tarjeta, resumen, entityCode = null, after }) {
  return db.activityLog.create({
    data: {
      actorId: null,
      actorName: `Script ${script}`,
      action: "UPDATE",
      entityType: "SCRIPT",
      entityCode,
      summary: resumen.slice(0, 500),
      after: after ?? undefined,
      origin: "SCRIPT",
      ticket: tarjeta,
      commitSha: commitActual(),
    },
  });
}
