// Revision de SOLO LECTURA: ordenes afectadas por el despacho incompleto (tarjeta 3v68avge).
// Lista las ordenes Despachadas o Cerradas con productos sin despacho activo y las que tienen
// productos Recogidos sin salir mientras otro producto ya salio. No escribe nada (solo findMany)
// y no tiene --aplicar: la lista es para que Alexander decida como corregir cada una.
//
// Uso (desde la raiz del repo, con DATABASE_URL del usuario de solo lectura en el entorno o en .env):
//   npm run ordenes:revisar-despachos
// Corre con vite-node; por eso usa rutas relativas (vite-node no conoce el alias "@/").

import { readFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

import { displayCode } from "../src/lib/code-display";
import { dispatchBlocker, dispatchGaps } from "../src/lib/order-dispatch";

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

const ESTADO: Record<string, string> = {
  DISPATCHED: "Despachada",
  COMPLETED: "Cerrada",
  READY_FOR_DISPATCH: "Lista para despacho",
  IN_PRODUCTION: "En producción",
  RELEASED: "Liberada",
  DRAFT: "Borrador",
};

async function main() {
  const databaseUrl = loadEnv("DATABASE_URL");
  if (!databaseUrl) {
    console.error("Falta DATABASE_URL.");
    process.exit(1);
  }
  const pool = new Pool({ connectionString: databaseUrl });
  const db = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    // Solo ordenes con al menos un producto en un despacho activo.
    const orders = await db.order.findMany({
      where: {
        status: { not: "CANCELLED" },
        dispatches: { some: { status: { notIn: ["CANCELLED", "RETURNED"] }, items: { some: {} } } },
      },
      select: {
        code: true,
        type: true,
        status: true,
        sale: { select: { code: true } },
        client: { select: { name: true } },
        items: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            fulfillmentMode: true,
            confirmedAt: true,
            confirmedSupplierId: true,
            purchaseCost: true,
            supplierPaymentStatus: true,
            product: { select: { name: true, code: true } },
            _count: { select: { photos: true } },
          },
        },
        dispatches: {
          where: { status: { notIn: ["CANCELLED", "RETURNED"] } },
          select: { code: true, items: { select: { orderItemId: true } } },
        },
      },
      orderBy: { code: "asc" },
    });

    let found = 0;
    for (const order of orders) {
      const items = order.items.map((item) => ({
        id: item.id,
        label: `${item.product.code ? `${item.product.code} ` : ""}${item.product.name}`,
        ready:
          dispatchBlocker(
            {
              fulfillmentMode: item.fulfillmentMode,
              confirmedAt: item.confirmedAt,
              confirmedSupplierId: item.confirmedSupplierId,
              hasPurchaseCost: item.purchaseCost !== null,
              photoCount: item._count.photos,
              supplierPaymentStatus: item.supplierPaymentStatus,
            },
            order.type === "PURCHASE",
          ) === null,
      }));
      const dispatchedItemIds = order.dispatches.flatMap((dispatch) => dispatch.items.map((row) => row.orderItemId));
      const result = dispatchGaps({ orderStatus: order.status, items, dispatchedItemIds });
      if (result.gaps.length === 0) continue;
      found += 1;
      const label = (id: string) => items.find((item) => item.id === id)?.label ?? id;
      console.log(
        `\n${displayCode(order.code)}${order.sale ? ` (${displayCode(order.sale.code)})` : ""} · ${order.client?.name ?? "sin cliente"} · ${ESTADO[order.status] ?? order.status}`,
      );
      console.log(`  Despachos: ${order.dispatches.map((dispatch) => displayCode(dispatch.code)).join(", ")}`);
      if (result.gaps.includes("despachada_incompleta")) {
        console.log(`  Orden ${ESTADO[order.status]} con productos sin despacho: ${result.missingIds.map(label).join("; ")}`);
      }
      if (result.gaps.includes("recogido_sin_salir")) {
        console.log(`  Recogidos sin despachar (otro ya salió): ${result.readyNotDispatchedIds.map(label).join("; ")}`);
      }
      console.log(
        order.status === "COMPLETED"
          ? "  Propuesta: la decide Alexander (la orden cerrada ya no acepta despachos y su cierre puede pesar en Balances)."
          : "  Propuesta: despachar lo pendiente desde la orden, con el flujo normal.",
      );
    }
    console.log(`\nOrdenes revisadas: ${orders.length} · con hallazgos: ${found}. No se cambió nada.`);
  } finally {
    await db.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
