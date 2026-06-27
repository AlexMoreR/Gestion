import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
const env = readFileSync(".env", "utf8");
const url = env.split("\n").find((l) => l.startsWith("DATABASE_URL"))?.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");
const p = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: url })) });

const prod = await p.product.findFirst({ where: { code: "CAV02" }, select: { id: true, code: true, name: true, price: true, baseCost: true } });
console.log(`Antes: ${prod.code} ${prod.name}  precio=${prod.price}  costo=${prod.baseCost}`);

// Costo real = proveedor (235.000) + flete por unidad (200.000 / 2 = 100.000) = 335.000
await p.product.update({ where: { id: prod.id }, data: { baseCost: 335000 } });

const after = await p.product.findUnique({ where: { id: prod.id }, select: { price: true, baseCost: true } });
const margin = ((Number(after.price) - Number(after.baseCost)) / Number(after.price)) * 100;
console.log(`Después: precio=${after.price}  costo=${after.baseCost}  % Detal=${margin.toFixed(2)}%`);
console.log("\n(El costo del proveedor Laura sigue en 235.000; la diferencia es el flete.)");
await p.$disconnect();
