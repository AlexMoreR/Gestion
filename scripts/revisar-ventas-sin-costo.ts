// Revision de ventas con costo dudoso (pedido de Alexander, oct-2026, caso SAL-00083: venta de
// stock sin productos ni orden, costo 0 y ganancia del 100 %).
//
// SOLO LECTURA: no escribe nada. Lista las ventas del mes (por fecha de la venta) que:
//   - no tienen productos (ni en la orden ni en la cotizacion),
//   - no tienen orden (antes su costo salia 0; ahora sale del catalogo, y su ganancia y comision bajan),
//   - tienen algun producto sin costo en el catalogo (su ganancia sigue inflada hasta cargarlo).
// Muestra el costo con la regla vieja (solo la orden) y con la nueva, para ver cuanto cambia.
//
// Uso (desde la raiz del repo, con DATABASE_URL en el entorno o en .env):
//   npm run ventas:revisar-costos                    # octubre de 2026
//   npm run ventas:revisar-costos -- --mes=2026-11
// Corre con vite-node; por eso usa rutas relativas (no conoce el alias "@/").

import { readFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

import {
  calculateSaleProfitSummary,
  pickSaleCostItems,
  productsWithoutCost,
  saleCostIssues,
  type SaleCostItem,
} from "../src/modules/balances/domain/calculations";

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

const money = (value: number) => `$${Math.round(value).toLocaleString("es-CO")}`;

async function main() {
  const monthArg = process.argv.find((arg) => arg.startsWith("--mes="))?.split("=")[1] ?? "2026-10";
  const match = /^(\d{4})-(\d{2})$/.exec(monthArg);
  if (!match) {
    console.error("Mes invalido. Usa --mes=AAAA-MM");
    process.exit(1);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  // Limites del mes en hora de Colombia (UTC-5, sin horario de verano).
  const from = new Date(`${match[1]}-${match[2]}-01T00:00:00-05:00`);
  const next = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
  const to = new Date(`${next}-01T00:00:00-05:00`);

  const databaseUrl = loadEnv("DATABASE_URL");
  if (!databaseUrl) {
    console.error("Falta DATABASE_URL.");
    process.exit(1);
  }
  const db = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: databaseUrl })) });
  try {
    const product = { select: { name: true, baseCost: true, additionalCost: true } };
    const sales = await db.sale.findMany({
      where: { createdAt: { gte: from, lt: to }, status: { not: "CANCELLED" } },
      orderBy: { code: "asc" },
      select: {
        code: true,
        total: true,
        status: true,
        client: { select: { name: true } },
        order: { select: { items: { select: { quantity: true, purchaseCost: true, fulfillmentMode: true, product } } } },
        quote: {
          select: {
            code: true,
            createdBy: { select: { name: true } },
            items: { select: { quantity: true, fulfillmentMode: true, product } },
          },
        },
        shippingCosts: { select: { amount: true } },
      },
    });

    let listed = 0;
    for (const sale of sales) {
      const toItem = (item: { quantity: number; fulfillmentMode: string; product: { baseCost: unknown; additionalCost: unknown } }, purchaseCost: number | null): SaleCostItem => ({
        quantity: item.quantity,
        purchaseCost,
        fulfillmentMode: item.fulfillmentMode,
        baseCost: Number(item.product.baseCost),
        additionalCost: Number(item.product.additionalCost),
      });
      const orderItems = sale.order?.items.map((item) => toItem(item, item.purchaseCost === null ? null : Number(item.purchaseCost)));
      const quoteItems = sale.quote.items.map((item) => toItem(item, null));
      const costItems = pickSaleCostItems(orderItems, quoteItems);
      const sourceItems = orderItems && orderItems.length > 0 ? sale.order!.items : sale.quote.items;
      const withoutCost = productsWithoutCost(
        sourceItems.map((item) => ({ name: item.product.name, baseCost: Number(item.product.baseCost), additionalCost: Number(item.product.additionalCost) })),
      );
      const issues = saleCostIssues({
        orderItems,
        quoteItems,
        productsWithoutCostNames: Array.from(new Set(withoutCost.map((item) => item.name))),
      });
      if (issues.length === 0) continue;

      const base = {
        saleId: sale.code,
        saleCode: sale.code,
        saleAmount: Number(sale.total),
        createdAt: from,
        clientName: null,
        shippingCosts: sale.shippingCosts.map((entry) => Number(entry.amount)),
      };
      const before = calculateSaleProfitSummary({ ...base, orderItems: orderItems ?? [] });
      const now = calculateSaleProfitSummary({ ...base, orderItems: costItems });
      listed += 1;
      console.log(
        [
          `${sale.code} (${sale.quote.code}, ${sale.status})`,
          `  cliente: ${sale.client.name ?? "-"} | vendedora: ${sale.quote.createdBy.name ?? "-"} | total: ${money(base.saleAmount)}`,
          `  costo antes: ${money(before.supplierCosts)} (ganancia ${money(before.netProfit)}) | costo ahora: ${money(now.supplierCosts)} (ganancia ${money(now.netProfit)})`,
          `  motivo: ${issues.join("; ")}`,
        ].join("\n"),
      );
    }
    console.log(`\n${listed} de ${sales.length} ventas de ${monthArg} para revisar. No se cambio nada.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
