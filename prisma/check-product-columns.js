// Diagnostic: print the REAL columns of every table involved in the failing
// storefront product query, and reproduce the relation SELECTs with raw SQL so
// Postgres reports the actual missing column by name (Prisma's driver adapter
// hides it as "(not available)"). Runs at container startup; read-only.
const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const EXPECTED = {
  Product: [
    "id", "code", "slug", "name", "description", "seoTitle", "seoDescription",
    "price", "baseCost", "retailMarginPct", "wholesaleMarginPct", "wholesalePrice",
    "minWholesaleQty", "categoryId", "thumbnailUrl", "createdAt", "updatedAt",
  ],
  Category: [
    "id", "name", "slug", "description", "seoTitle", "seoDescription", "logoUrl",
    "isActive", "createdAt", "updatedAt",
  ],
  ProductImage: ["id", "productId", "url", "order", "createdAt"],
  Supplier: ["id", "name", "email", "phone", "isActive", "createdAt", "updatedAt"],
  ProductSupplier: [
    "productId", "supplierId", "supplierSku", "supplierCost", "isPreferred",
    "createdAt", "updatedAt",
  ],
};

async function listColumns(table) {
  const { rows } = await pool.query(
    "select column_name from information_schema.columns where table_schema = 'public' and table_name = $1 order by ordinal_position",
    [table],
  );
  return rows.map((r) => r.column_name);
}

async function tryQuery(label, sql) {
  try {
    await pool.query(sql);
    console.log(`[probe] ${label}: OK`);
  } catch (err) {
    console.log(`[probe] ${label}: FAILED -> ${err.message}`);
  }
}

(async () => {
  try {
    console.log("==================== DB DIAGNOSTIC ====================");
    for (const [table, expected] of Object.entries(EXPECTED)) {
      const cols = await listColumns(table);
      if (cols.length === 0) {
        console.log(`[${table}] TABLE NOT FOUND`);
        continue;
      }
      const missing = expected.filter((c) => !cols.includes(c));
      console.log(`[${table}] columns: ${cols.join(", ")}`);
      console.log(`[${table}] MISSING: ${missing.length ? missing.join(", ") : "(none)"}`);
    }

    // Reproduce the relation SELECTs Prisma runs for the storefront query.
    console.log("---- reproducing storefront relation queries ----");
    await tryQuery("Product scalars", 'SELECT "id","code","slug","name","description","seoTitle","seoDescription","price","baseCost","retailMarginPct","wholesaleMarginPct","wholesalePrice","minWholesaleQty","categoryId","thumbnailUrl","createdAt","updatedAt" FROM "Product" ORDER BY "createdAt" DESC LIMIT 4');
    await tryQuery("Category scalars", 'SELECT "id","name","slug","description","seoTitle","seoDescription","logoUrl","isActive","createdAt","updatedAt" FROM "Category" LIMIT 4');
    await tryQuery("ProductImage scalars", 'SELECT "id","productId","url","order","createdAt" FROM "ProductImage" ORDER BY "order" ASC LIMIT 4');
    console.log("======================================================");
  } catch (err) {
    console.error("DB DIAGNOSTIC error:", err.message);
  } finally {
    await pool.end();
  }
})();
