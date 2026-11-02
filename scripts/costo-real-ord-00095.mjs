// Correccion de UNA SOLA VEZ (nov-2026): la ORD-00095 (venta SAL-00087,
// combo CMB005 por stock) se costeo con el catalogo (605.000) y no con lo que cobro la
// proveedora en la compra ORD-00092 (Laura Vanessa P-03, 2 combos camilla divan por 1.200.000).
//
// Que hace: a cada pieza de la ORD-00095 cuyo producto esta en la ORD-00092 le pone como
// purchaseCost el costo unitario de esa linea de compra (sin flete) y stockCostSource
// "ORD-00092". Las piezas que no estan en esa compra NO se tocan y se informan. No recalcula
// ninguna otra venta.
//
// Por defecto SOLO SIMULA. Escribe unicamente con --aplicar (en una transaccion, con ActivityLog).
// Se puede correr dos veces: si ya esta corregida, no hace nada.
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

if (!process.env.DATABASE_URL) {
  try {
    const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
    const match = env.match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m);
    if (match) process.env.DATABASE_URL = match[1];
  } catch {
    // sin .env: se confia en el entorno
  }
}

const prisma = new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL })),
});

const APLICAR = process.argv.includes("--aplicar");
const ORDEN = "ORD-00095";
const VENTA = "SAL-00087";
const COMPRA = "ORD-00092";

const money = (n) => `$${Math.round(n).toLocaleString("es-CO")}`;
const salir = async (mensaje) => {
  console.error(mensaje);
  await prisma.$disconnect();
  process.exit(1);
};

const itemSelect = {
  id: true,
  productId: true,
  quantity: true,
  fulfillmentMode: true,
  purchaseCost: true,
  stockCostSource: true,
  product: {
    select: {
      code: true,
      name: true,
      baseCost: true,
      additionalCost: true,
      suppliers: { where: { isPreferred: true }, select: { supplierCost: true }, take: 1 },
    },
  },
};

const [order, purchase] = await Promise.all([
  prisma.order.findUnique({
    where: { code: ORDEN },
    select: { id: true, type: true, status: true, sale: { select: { code: true } }, items: { select: itemSelect } },
  }),
  prisma.order.findUnique({
    where: { code: COMPRA },
    select: { type: true, items: { select: { productId: true, quantity: true, purchaseCost: true } } },
  }),
]);
if (!order) await salir(`No existe la ${ORDEN}.`);
if (order.type !== "SALE" || order.sale?.code !== VENTA) {
  await salir(`La ${ORDEN} no es la venta ${VENTA} (tipo ${order.type}, venta ${order.sale?.code ?? "-"}). No se toca.`);
}
if (!purchase) await salir(`No existe la ${COMPRA}.`);
if (purchase.type !== "PURCHASE") await salir(`La ${COMPRA} no es una compra (tipo ${purchase.type}). No se toca.`);

console.log(`${ORDEN} (${VENTA}): estado ${order.status}`);
if (order.status === "COMPLETED") {
  console.log(`  OJO: la ${ORDEN} ya está entregada; el cambio mueve la ganancia del mes de la entrega.`);
}

// Costo por unidad de cada producto en la compra: lo que cobro la proveedora (sin flete), igual que fifo.
const costoCompra = new Map();
for (const productId of new Set(purchase.items.map((i) => i.productId))) {
  const lines = purchase.items.filter((i) => i.productId === productId && i.purchaseCost !== null);
  const units = lines.reduce((sum, i) => sum + i.quantity, 0);
  if (units > 0) {
    const total = lines.reduce((sum, i) => sum + Number(i.purchaseCost) * i.quantity, 0);
    costoCompra.set(productId, Math.round((total / units) * 100) / 100);
  }
}

// Costo que usa hoy Balances (mismo orden que computeItemUnitCost).
const costoActual = (item) => {
  if (item.purchaseCost !== null) return Number(item.purchaseCost);
  const base = Number(item.product.baseCost ?? 0);
  if (item.fulfillmentMode === "STOCK") return base + Number(item.product.additionalCost ?? 0);
  const preferred = item.product.suppliers[0]?.supplierCost;
  return preferred != null ? Number(preferred) : base;
};

let antes = 0;
let despues = 0;
const cambios = [];
const sinCompra = [];
console.log("\nPiezas:");
for (const item of order.items) {
  const actual = costoActual(item);
  const nuevo = costoCompra.get(item.productId);
  const nombre = `${item.product.code} ${item.product.name} x${item.quantity}`;
  antes += actual * item.quantity;
  if (nuevo === undefined) {
    despues += actual * item.quantity;
    sinCompra.push(nombre);
    console.log(`  - ${nombre}: ${money(actual)} (no está en la ${COMPRA}: NO se toca)`);
    continue;
  }
  despues += nuevo * item.quantity;
  const igual = item.purchaseCost !== null && Number(item.purchaseCost) === nuevo && item.stockCostSource === COMPRA;
  console.log(`  - ${nombre}: ${money(actual)} → ${money(nuevo)} (origen ${COMPRA})${igual ? " ya estaba" : ""}`);
  if (!igual) cambios.push({ id: item.id, nuevo });
}

console.log(`\nTotal costo ${ORDEN}: ${money(antes)} → ${money(despues)}`);
if (sinCompra.length) console.log(`Sin compra en la ${COMPRA} (sin tocar): ${sinCompra.join("; ")}`);
console.log(`Piezas a cambiar: ${cambios.length}`);

if (!APLICAR) {
  console.log("SIMULACIÓN: no se escribió nada. Usa --aplicar para escribir.");
  await prisma.$disconnect();
  process.exit(0);
}
if (cambios.length === 0) {
  console.log("Nada que cambiar.");
  await prisma.$disconnect();
  process.exit(0);
}

const actor = await prisma.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, email: true } });
if (!actor) await salir("No hay un usuario ADMIN para firmar la corrección.");

await prisma.$transaction(async (tx) => {
  for (const c of cambios) {
    await tx.orderItem.update({ where: { id: c.id }, data: { purchaseCost: c.nuevo, stockCostSource: COMPRA } });
  }
  await tx.activityLog.create({
    data: {
      actorId: actor.id,
      actorName: actor.name ?? actor.email,
      action: "UPDATE",
      entityType: "ORDER",
      entityId: order.id,
      summary: `Costo real de ${ORDEN} (${VENTA}) desde la compra ${COMPRA}: ${money(antes)} → ${money(despues)} (${cambios.length} piezas, script)`,
    },
  });
});
console.log("Listo: corrección aplicada.");
await prisma.$disconnect();
