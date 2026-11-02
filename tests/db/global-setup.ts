import { execSync } from "node:child_process";
import { Client } from "pg";

/**
 * Deja la base vacía y con el esquema de prisma/schema.prisma.
 * Solo corre contra un Postgres local: borra TODO lo que haya en el esquema public.
 * shortcut: `prisma db push` y no `migrate deploy`, porque las migraciones no arman la base desde
 * cero (ninguna crea la tabla "Sale"); cambiar a `migrate deploy` cuando exista una migración base.
 */
export default async function setup() {
  const url = process.env.DATABASE_URL ?? "";
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  })();
  if (!["localhost", "127.0.0.1"].includes(host)) {
    throw new Error("test:db solo corre contra un Postgres local desechable (DATABASE_URL en localhost).");
  }
  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
  await client.end();
  execSync("npx prisma db push", { stdio: "inherit", env: process.env });
}
