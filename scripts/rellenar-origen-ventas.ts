// Relleno del ORIGEN de ventas viejas (decision de Alexander, 7-oct-2026: "las ventas viejas se
// clasifican con la misma regla, buscando el chat por el telefono del cliente").
//
// Para cada venta con origin NULL:
//   1. Toma el telefono del cliente (User.phone) y lo deja en solo digitos.
//   2. Pregunta al CRM: GET {CRM_ORIGEN_URL}?telefono=<digitos> con "Authorization: Bearer {CRM_ORIGEN_LLAVE}".
//   3. Aplica la regla: REFERIDO_RECURRENTE -> RECURRENTE si el cliente tenia una venta anterior
//      (no cancelada), si no REFERIDO (misma funcion que usa /api/ventas/origen).
//   4. Sin telefono o sin chat en el CRM -> sugiere MOSTRADOR si es venta directa, si no SIN_DATO.
//
// POR DEFECTO ES SIMULACION: solo imprime lo que haria (telefonos enmascarados) y no escribe nada.
// Solo con --aplicar escribe; y aun asi solo toca ventas que siguen en NULL (no pisa un origen que
// haya llegado del CRM mientras tanto). SIN_DATO no se escribe salvo con --marcar-sin-dato, para que
// una corrida futura (con mejor captura en el CRM) las vuelva a intentar.
//
// Uso (desde la raiz del repo, con DATABASE_URL en el entorno o en .env):
//   npm run origen:rellenar                         # simulacion de todas
//   npm run origen:rellenar -- --desde=2026-08-01   # solo ventas creadas desde esa fecha
//   npm run origen:rellenar -- --limite=20
//   npm run origen:rellenar -- --aplicar            # escribe (pedir aprobacion antes)
//   npm run origen:rellenar -- --ayuda
// Corre con vite-node (viene con vitest, no agrega dependencias). Por eso este archivo y lo que
// importa usan rutas relativas (vite-node no conoce el alias "@/").

import { readFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "@prisma/client";
import { Pool } from "pg";

import { resolveOriginForClient } from "../src/modules/ventas/application/register-sale-origin";
import {
  backfillFallbackOrigin,
  CONSUMIDOR_FINAL_EMAIL,
  isProbableDirectSale,
  maskPhone,
  type OriginDetail,
  parseCrmLookup,
  phoneDigits,
  phoneMatchKey,
  type SaleOriginCode,
} from "../src/modules/ventas/domain/sale-origin";
import { createPrismaSaleOriginRepository } from "../src/modules/ventas/infrastructure/prisma-sale-origin-repository";

const AYUDA = `Relleno del origen de ventas (por defecto SIMULACION, no escribe nada).
  --aplicar           escribe el origen en las ventas que siguen sin origen
  --marcar-sin-dato   con --aplicar, tambien escribe SIN_DATO (si no, se dejan en NULL)
  --desde=AAAA-MM-DD  solo ventas creadas desde esa fecha
  --limite=N          maximo de ventas a revisar
Variables: DATABASE_URL, CRM_ORIGEN_URL (ej. https://app.aizenbot.com/api/origen), CRM_ORIGEN_LLAVE.`;

type Options = { apply: boolean; markUnknown: boolean; since: Date | null; limit: number | null };

function parseOptions(argv: string[]): Options | null {
  if (argv.includes("--ayuda") || argv.includes("--help")) return null;
  const value = (name: string) => argv.find((arg) => arg.startsWith(`${name}=`))?.split("=")[1];
  const sinceRaw = value("--desde");
  const since = sinceRaw && /^\d{4}-\d{2}-\d{2}$/.test(sinceRaw) ? new Date(`${sinceRaw}T00:00:00`) : null;
  const limitRaw = Number(value("--limite"));
  return {
    apply: argv.includes("--aplicar"),
    markUnknown: argv.includes("--marcar-sin-dato"),
    since,
    limit: Number.isInteger(limitRaw) && limitRaw > 0 ? limitRaw : null,
  };
}

// Carga una variable desde .env si no esta en el entorno (igual que los otros scripts).
function loadEnv(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  try {
    const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
    const match = env.match(new RegExp(`^${name}\\s*=\\s*"?([^"\\r\\n]+)"?`, "m"));
    if (match) process.env[name] = match[1];
  } catch {
    // sin .env: se confia en el entorno
  }
  return process.env[name];
}

type Lookup = Awaited<ReturnType<typeof consultCrm>>;

async function consultCrm(url: string, key: string, digits: string) {
  const target = new URL(url);
  target.searchParams.set("telefono", digits);
  try {
    const response = await fetch(target, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      return { error: `HTTP ${response.status}` } as const;
    }
    const parsed = parseCrmLookup(await response.json());
    return parsed ? ({ result: parsed } as const) : ({ error: "respuesta invalida del CRM" } as const);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "error de red" } as const;
  }
}

function describeDetail(detail: OriginDetail | null): string {
  if (!detail) return "";
  const parts = [
    detail.adTitle ? `anuncio "${detail.adTitle}"` : detail.adId ? `anuncio ${detail.adId}` : null,
    detail.mkCuenta ? `cuenta ${detail.mkCuenta}` : null,
    detail.linea ? `linea ${detail.linea}` : null,
  ].filter(Boolean);
  return parts.length ? ` (${parts.join(", ")})` : "";
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (!options) {
    console.log(AYUDA);
    return;
  }

  const databaseUrl = loadEnv("DATABASE_URL");
  const crmUrl = loadEnv("CRM_ORIGEN_URL");
  const crmKey = loadEnv("CRM_ORIGEN_LLAVE");
  if (!databaseUrl || !crmUrl || !crmKey) {
    console.error("Faltan variables: DATABASE_URL, CRM_ORIGEN_URL y CRM_ORIGEN_LLAVE son obligatorias.\n");
    console.log(AYUDA);
    process.exitCode = 1;
    return;
  }

  const db = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: databaseUrl })) });
  const repository = createPrismaSaleOriginRepository(db);

  try {
    const sales = await db.sale.findMany({
      where: { origin: null, ...(options.since ? { createdAt: { gte: options.since } } : {}) },
      orderBy: { createdAt: "asc" },
      ...(options.limit ? { take: options.limit } : {}),
      select: {
        id: true,
        code: true,
        createdAt: true,
        client: { select: { id: true, email: true, phone: true } },
        quote: { select: { id: true, code: true, createdAt: true, origin: true } },
      },
    });

    console.log(`${options.apply ? "APLICANDO" : "SIMULACION (no se escribe nada)"} · ventas sin origen: ${sales.length}\n`);

    const cache = new Map<string, Lookup>(); // un telefono = una consulta al CRM
    const counts = new Map<string, number>();
    let written = 0;
    let errors = 0;

    for (const sale of sales) {
      const isGeneric = sale.client.email === CONSUMIDOR_FINAL_EMAIL;
      const isDirect = isGeneric || isProbableDirectSale({ quoteCreatedAt: sale.quote.createdAt, saleCreatedAt: sale.createdAt });
      const digits = isGeneric ? "" : phoneDigits(sale.client.phone);
      const key = phoneMatchKey(digits);

      let origin: SaleOriginCode;
      let detail: OriginDetail | null = null;
      let reason: string;

      if (!key) {
        origin = backfillFallbackOrigin(isDirect);
        reason = isGeneric ? "consumidor final" : "sin telefono";
      } else {
        const lookup = cache.get(key) ?? (await consultCrm(crmUrl, crmKey, digits));
        cache.set(key, lookup);
        if ("error" in lookup) {
          errors += 1;
          console.log(`  ${sale.code} (${sale.quote.code}) ${maskPhone(digits)} -> ERROR CRM: ${lookup.error} (se omite)`);
          continue;
        }
        if (!lookup.result.encontrado) {
          origin = backfillFallbackOrigin(isDirect);
          reason = "sin chat en el CRM";
        } else {
          origin = await resolveOriginForClient(repository, {
            origin: lookup.result.origin,
            client: { id: sale.client.id, isGeneric },
            phone: digits,
            before: sale.createdAt,
            excludeSaleId: sale.id,
          });
          detail = { ...(lookup.result.originDetail ?? {}), via: "telefono" };
          reason = `chat encontrado (${lookup.result.origin})`;
        }
      }

      counts.set(origin, (counts.get(origin) ?? 0) + 1);
      const willWrite = options.apply && (origin !== "SIN_DATO" || options.markUnknown);
      console.log(
        `  ${sale.code} (${sale.quote.code}) ${maskPhone(digits)} -> ${origin}${describeDetail(detail)} · ${reason}${
          isDirect && !isGeneric ? " · venta directa probable" : ""
        }${willWrite ? " · ESCRITO" : ""}`,
      );

      if (willWrite) {
        const data = {
          origin,
          ...(detail ? { originDetail: detail as Prisma.InputJsonValue } : {}),
        };
        // Solo si sigue en NULL: no pisa un origen que el CRM haya avisado mientras corria.
        const result = await db.sale.updateMany({ where: { id: sale.id, origin: null }, data });
        if (!sale.quote.origin) {
          await db.quote.updateMany({ where: { id: sale.quote.id, origin: null }, data });
        }
        written += result.count;
      }
    }

    console.log("\nResumen sugerido:");
    for (const [origin, count] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${origin}: ${count}`);
    }
    if (errors) console.log(`  errores del CRM (omitidas): ${errors}`);
    console.log(options.apply ? `\nVentas actualizadas: ${written}` : "\n[simulacion] No se aplico ningun cambio. Usa --aplicar para escribir.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
