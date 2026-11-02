// Revisión de SOLO LECTURA (parte 3 de "Ventas de stock: que siempre lleven el producto y su costo").
// Lista las ventas de octubre 2026 (creadas o que cuentan en Balances ese mes) que quedaron sin
// productos o sin costo, como SAL-00083, para que Alexander decida qué corregir. No escribe nada:
// solo findMany, sin opción --aplicar.
//
// Uso (desde la raíz del repo, con DATABASE_URL en el entorno o en .env):
//   npm run ventas:revisar-costos
// Corre con vite-node; por eso usa rutas relativas (vite-node no conoce el alias "@/").

import { readFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

import { colombiaMonthRange, dbWindow, inColombiaPeriod } from "../src/lib/colombia-time";
import { computeFullyPaidAt, resolveProfitRecognition } from "../src/modules/balances/domain/recognition";
import { saleCostReviewReasons } from "../src/modules/ventas/domain/sale-cost-review";

const MES = "2026-10";

// Carga DATABASE_URL desde .env si no está en el entorno (igual que los otros scripts).
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

const product = { select: { name: true, baseCost: true, additionalCost: true } } as const;

async function main() {
  const databaseUrl = loadEnv("DATABASE_URL");
  if (!databaseUrl) {
    console.error("Falta DATABASE_URL.");
    process.exitCode = 1;
    return;
  }

  const range = colombiaMonthRange(MES);
  const db = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: databaseUrl })) });
  try {
    // Todas las ventas creadas hasta fin de mes: una venta de septiembre puede contar en octubre.
    const sales = await db.sale.findMany({
      where: { createdAt: { lt: dbWindow(range).end } },
      orderBy: { createdAt: "asc" },
      select: {
        code: true,
        total: true,
        status: true,
        paymentMethod: true,
        createdAt: true,
        downPaymentAmount: true,
        salePayments: { select: { amount: true, paymentDate: true, createdAt: true } },
        client: { select: { name: true } },
        quote: {
          select: {
            code: true,
            createdBy: { select: { name: true } },
            items: { select: { quantity: true, product } },
          },
        },
        order: {
          select: {
            status: true,
            completedAt: true,
            history: { where: { toStatus: "COMPLETED" }, orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
            items: { select: { quantity: true, purchaseCost: true, fulfillmentMode: true, product } },
          },
        },
      },
    });

    const rows = [];
    for (const sale of sales) {
      // Mes en que cuenta en Balances: misma regla (solo ventas pagadas por completo).
      const deliveredAt =
        sale.order?.status === "COMPLETED" ? (sale.order.history[0]?.createdAt ?? sale.order.completedAt ?? null) : null;
      const recognition =
        sale.status === "INVOICED"
          ? resolveProfitRecognition({
              paymentMethod: sale.paymentMethod,
              orderStatus: sale.order?.status ?? null,
              deliveredAt,
              fullyPaidAt: computeFullyPaidAt({
                total: Number(sale.total),
                recordedPaid: Number(sale.downPaymentAmount),
                saleCreatedAt: sale.createdAt,
                payments: sale.salePayments.map((p) => ({ amount: Number(p.amount), date: p.paymentDate ?? p.createdAt })),
              }),
              saleCreatedAt: sale.createdAt,
            })
          : null;
      const inMonth =
        inColombiaPeriod(sale.createdAt, range) || (recognition != null && inColombiaPeriod(recognition.recognizedAt, range));
      if (!inMonth) continue;

      const reasons = saleCostReviewReasons(
        (sale.order?.items ?? []).map((item) => ({
          quantity: item.quantity,
          purchaseCost: item.purchaseCost === null ? null : Number(item.purchaseCost),
          fulfillmentMode: item.fulfillmentMode,
          baseCost: Number(item.product.baseCost),
          additionalCost: Number(item.product.additionalCost),
          productName: item.product.name,
        })),
        sale.quote.items.map((item) => ({
          quantity: item.quantity,
          baseCost: Number(item.product.baseCost),
          additionalCost: Number(item.product.additionalCost),
          productName: item.product.name,
        })),
      );
      if (reasons.length === 0) continue;

      rows.push({
        venta: sale.code,
        cotizacion: sale.quote.code,
        cliente: sale.client.name ?? "",
        vendedora: sale.quote.createdBy.name ?? "",
        total: Number(sale.total),
        estado: sale.status,
        forma_pago: sale.paymentMethod ?? "sin definir",
        tiene_orden: sale.order ? "sí" : "no",
        motivo: reasons.join("; "),
      });
    }

    console.log(`Ventas de ${MES} sin productos o sin costo (solo lectura, no se cambió nada): ${rows.length}`);
    if (rows.length > 0) console.table(rows);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
