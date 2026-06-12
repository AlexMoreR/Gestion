// Diagnostic: reproduce the EXACT failing storefront query with the real
// Prisma client + pg adapter, capture the SQL Prisma generates, and dump the
// full error.meta (which Prisma hides as "(not available)" / "[Object]" in the
// app logs). Runs at container startup; read-only.
const { Pool } = require("pg");

const connectionString = process.env.DATABASE_URL;

async function dumpColumns(pool) {
  for (const table of ["Product", "Category", "ProductImage"]) {
    const { rows } = await pool.query(
      "select column_name from information_schema.columns where table_schema='public' and table_name=$1 order by ordinal_position",
      [table],
    );
    console.log(`[${table}] columns: ${rows.map((r) => r.column_name).join(", ")}`);
  }
}

(async () => {
  console.log("==================== DB DIAGNOSTIC ====================");

  // 1) Patch the pool so we can see the SQL Prisma actually sends.
  const pool = new Pool({ connectionString });
  const originalQuery = pool.query.bind(pool);
  let lastSql = null;
  pool.query = (...args) => {
    const text = typeof args[0] === "string" ? args[0] : args[0] && args[0].text;
    if (text && !String(text).includes("information_schema")) lastSql = text;
    return originalQuery(...args);
  };

  try {
    await dumpColumns(pool);
  } catch (e) {
    console.log("column dump error:", e.message);
  }

  // 2) Reproduce the exact storefront query with the real Prisma client.
  try {
    const { PrismaClient } = require("@prisma/client");
    const { PrismaPg } = require("@prisma/adapter-pg");
    const adapter = new PrismaPg(pool);
    const prisma = new PrismaClient({ adapter, log: ["error"] });

    console.log("---- running real prisma.product.findMany ----");
    try {
      const rows = await prisma.product.findMany({
        orderBy: { createdAt: "desc" },
        include: { category: true, images: { orderBy: { order: "asc" } } },
      });
      console.log(`[prisma] findMany OK (${rows.length} rows)`);
    } catch (e) {
      console.log("[prisma] findMany FAILED:", e.message);
      console.log("[prisma] code:", e.code);
      console.log("[prisma] meta:", JSON.stringify(e.meta));
      console.log("[prisma] last SQL Prisma sent:", lastSql);
    }
    await prisma.$disconnect();
  } catch (e) {
    console.log("could not load prisma client:", e.message);
  }

  console.log("======================================================");
  await pool.end();
})();
