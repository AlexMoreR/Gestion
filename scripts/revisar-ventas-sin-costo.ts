// Revision de SOLO LECTURA: ventas de un mes (por defecto octubre 2026) sin productos o con costo 0,
// como la SAL-00083. No escribe nada (solo findMany) y no tiene --aplicar: la lista es para que
// Alexander decida que corregir.
//
// Entra una venta creada en el mes o que cuenta en Balances en ese mes (pago completo; contraentrega
// al entregar: resolveProfitRecognition). Motivos en saleCostIssues (src/modules/balances/domain).
//
// Uso (desde la raiz del repo, con DATABASE_URL en el entorno o en .env):
//   npm run ventas:revisar-costos
//   npm run ventas:revisar-costos -- --mes=2026-11
// Corre con vite-node; por eso usa rutas relativas (vite-node no conoce el alias "@/").

import { readFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

import { colombiaMonthRange, dbWindow, inColombiaPeriod } from "../src/lib/colombia-time";
import { computeFullyPaidAt, resolveProfitRecognition } from "../src/modules/balances/domain/recognition";
import { saleCostIssues } from "../src/modules/balances/domain/sale-cost-review";

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

const num = (value: unknown) => (value == null ? 0 : Number(value));

async function main() {
  const mesArg = process.argv.find((arg) => arg.startsWith("--mes="))?.split("=")[1] ?? "2026-10";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mesArg)) {
    console.error("--mes debe ser AAAA-MM");
    process.exit(1);
  }
  const databaseUrl = loadEnv("DATABASE_URL");
  if (!databaseUrl) {
    console.error("Falta DATABASE_URL.");
    process.exit(1);
  }

  const range = colombiaMonthRange(mesArg);
  const window = dbWindow(range);
  const inWindow = { gte: window.start, lt: window.end };
  const pool = new Pool({ connectionString: databaseUrl });
  const db = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const costFields = { baseCost: true, additionalCost: true, name: true } as const;
    // Candidatas: creadas en el mes, o con un abono o una entrega en el mes (puede ser cuando cuentan).
    const sales = await db.sale.findMany({
      where: {
        createdAt: { lt: window.end },
        OR: [
          { createdAt: inWindow },
          { salePayments: { some: { OR: [{ paymentDate: inWindow }, { createdAt: inWindow }] } } },
          { order: { OR: [{ completedAt: inWindow }, { history: { some: { toStatus: "COMPLETED", createdAt: inWindow } } }] } },
        ],
      },
      orderBy: { code: "asc" },
      select: {
        code: true,
        total: true,
        status: true,
        paymentMethod: true,
        createdAt: true,
        downPaymentAmount: true,
        client: { select: { name: true } },
        salePayments: { select: { amount: true, paymentDate: true, createdAt: true } },
        quote: {
          select: {
            code: true,
            createdBy: { select: { name: true } },
            items: { select: { quantity: true, product: { select: costFields } } },
          },
        },
        order: {
          select: {
            status: true,
            completedAt: true,
            history: { where: { toStatus: "COMPLETED" }, orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
            items: { select: { quantity: true, purchaseCost: true, fulfillmentMode: true, product: { select: costFields } } },
          },
        },
      },
    });

    const rows = [];
    for (const sale of sales) {
      // Misma fecha que Balances: solo una venta pagada por completo (INVOICED) cuenta.
      const deliveredAt =
        sale.order?.status === "COMPLETED" ? (sale.order.history[0]?.createdAt ?? sale.order.completedAt ?? null) : null;
      const recognition =
        sale.status === "INVOICED"
          ? resolveProfitRecognition({
              paymentMethod: sale.paymentMethod,
              orderStatus: sale.order?.status ?? null,
              deliveredAt,
              fullyPaidAt: computeFullyPaidAt({
                total: num(sale.total),
                recordedPaid: num(sale.downPaymentAmount),
                saleCreatedAt: sale.createdAt,
                payments: sale.salePayments.map((p) => ({ amount: num(p.amount), date: p.paymentDate ?? p.createdAt })),
              }),
              saleCreatedAt: sale.createdAt,
            })
          : null;
      const inMonth =
        inColombiaPeriod(sale.createdAt, range) || (recognition != null && inColombiaPeriod(recognition.recognizedAt, range));
      if (!inMonth) continue;

      const issues = saleCostIssues(
        sale.order?.items.map((item) => ({
          name: item.product.name,
          quantity: item.quantity,
          purchaseCost: item.purchaseCost == null ? null : num(item.purchaseCost),
          fulfillmentMode: item.fulfillmentMode,
          baseCost: num(item.product.baseCost),
          additionalCost: num(item.product.additionalCost),
        })),
        sale.quote.items.map((item) => ({
          name: item.product.name,
          quantity: item.quantity,
          baseCost: num(item.product.baseCost),
          additionalCost: num(item.product.additionalCost),
        })),
      );
      if (issues.length === 0) continue;
      rows.push({
        venta: sale.code,
        cotizacion: sale.quote.code,
        cliente: sale.client.name ?? "sin dato",
        vendedora: sale.quote.createdBy.name ?? "sin dato",
        total: num(sale.total).toLocaleString("es-CO"),
        estado: sale.status,
        forma_pago: sale.paymentMethod ?? "sin dato",
        orden: sale.order ? "si" : "no",
        motivo: issues.join("; "),
      });
    }

    console.log(`Ventas de ${mesArg} sin productos o con costo 0 (solo lectura, no se cambio nada): ${rows.length}`);
    if (rows.length > 0) console.table(rows);
  } finally {
    await db.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
