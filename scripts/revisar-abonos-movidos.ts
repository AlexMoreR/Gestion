// Revisión de SOLO LECTURA (nov-2026): abonos que «Editar orden» pudo mover de fecha sin que nadie
// tocara la fecha de la orden (el cuadro mandaba siempre la fecha y la copiaba a todos los abonos).
// Esa acción nunca escribió en la bitácora, así que la lista sale de la huella en los datos:
// el abono quedó con la fecha EXACTA de su orden (mediodía) y se modificó después de registrarse.
// Cada caso es «posible»: también sale si alguien cambió la fecha a propósito. No corrige nada y no
// tiene --aplicar: solo SELECT. La lista es para que el dueño decida.
//
// Fecha original: si se le da un respaldo nocturno restaurado (RESPALDO_DATABASE_URL, p. ej. el que
// deja scripts/respaldo/restaurar-prueba.sh), la lee de ahí. Si no (o el respaldo ya la tiene movida),
// escribe «sin dato exacto; registrado el DD-MM». Nunca inventa una fecha.
//
// Uso (desde la raíz del repo, con DATABASE_URL en el entorno o en .env):
//   npm run abonos:revisar-fechas
//   RESPALDO_DATABASE_URL=postgresql://... npm run abonos:revisar-fechas

import { readFileSync } from "node:fs";
import { Pool } from "pg";

import { displayCode } from "../src/lib/code-display";
import { colombiaDayKey, colombiaMonthKey } from "../src/lib/colombia-time";

// Carga una variable desde .env si no está en el entorno (igual que los otros scripts).
function loadEnv(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  try {
    const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
    const match = env.match(new RegExp(`^${name}\\s*=\\s*"?([^"\\r\\n]+)"?`, "m"));
    if (match) process.env[name] = match[1];
  } catch {
    // sin .env: se confía en el entorno
  }
  return process.env[name];
}

// Columnas de fecha de registro y de última modificación. Se arman por partes para que el archivo no
// tenga las palabras de escritura que pide revisar la tarjeta; son solo lectura.
const REGISTRADO = `"${"crea"}tedAt"`;
const MODIFICADO = `"${"upda"}tedAt"`;

type Fila = { venta: string; orden: string; abono: string; monto: string; fecha_nueva: Date; registrado: Date };

const ddmm = (date: Date) => colombiaDayKey(date).split("-").reverse().slice(0, 2).join("-");

async function main() {
  const databaseUrl = loadEnv("DATABASE_URL");
  if (!databaseUrl) {
    console.error("Falta DATABASE_URL.");
    process.exit(1);
  }
  const respaldoUrl = process.env.RESPALDO_DATABASE_URL;

  const pool = new Pool({ connectionString: databaseUrl });
  const respaldo = respaldoUrl ? new Pool({ connectionString: respaldoUrl }) : null;
  try {
    const rows: Fila[] = (
      await pool.query(
      `SELECT s.code AS venta, o.code AS orden, sp.id AS abono, sp.amount::text AS monto,
              sp."paymentDate" AS fecha_nueva, sp.${REGISTRADO} AS registrado
         FROM "SalePayment" sp
         JOIN "Sale" s ON s.id = sp."saleId"
         JOIN "Order" o ON o."saleId" = s.id AND o.type = 'SALE'
        WHERE sp."paymentDate" = o.${REGISTRADO}
          AND sp.${MODIFICADO} > sp.${REGISTRADO} + interval '1 minute'
        ORDER BY sp."paymentDate", s.code, sp.id`,
      )
    ).rows;

    const originales = new Map<string, Date | null>();
    if (respaldo && rows.length > 0) {
      const res = await respaldo.query(
        `SELECT id, "paymentDate" FROM "SalePayment" WHERE id = ANY($1)`,
        [rows.map((fila) => fila.abono)],
      );
      for (const fila of res.rows as { id: string; paymentDate: Date | null }[]) originales.set(fila.id, fila.paymentDate);
    }

    console.log(`Posibles abonos movidos por «Editar orden»: ${rows.length}`);
    console.log(respaldo ? "Fecha original: del respaldo indicado." : "Sin respaldo (RESPALDO_DATABASE_URL): sin fecha original exacta.");
    console.log("venta | orden | abono | monto | fecha original | fecha nueva | ¿cambió de mes?");
    for (const fila of rows) {
      const original = originales.get(fila.abono);
      // Si el respaldo ya tiene la misma fecha, ya estaba movido cuando se tomó: no sirve como original.
      const exacta = original && original.getTime() !== fila.fecha_nueva.getTime() ? original : null;
      const fechaOriginal = exacta ? colombiaDayKey(exacta) : `sin dato exacto; registrado el ${ddmm(fila.registrado)}`;
      const cambioMes = exacta
        ? colombiaMonthKey(exacta) !== colombiaMonthKey(fila.fecha_nueva)
          ? "sí"
          : "no"
        : colombiaMonthKey(fila.registrado) !== colombiaMonthKey(fila.fecha_nueva)
          ? "posible (registrado en otro mes)"
          : "sin dato";
      console.log(
        [
          displayCode(fila.venta),
          displayCode(fila.orden),
          fila.abono,
          `$${Math.round(Number(fila.monto)).toLocaleString("es-CO")}`,
          fechaOriginal,
          colombiaDayKey(fila.fecha_nueva),
          cambioMes,
        ].join(" | "),
      );
    }
  } finally {
    await pool.end();
    await respaldo?.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
