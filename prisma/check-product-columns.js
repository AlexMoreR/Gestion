// Diagnostic: print the REAL columns of Product/Category in the database the
// app actually connects to. Runs at container startup so the output shows up
// in the same logs as the prisma:error messages. Safe & read-only.
const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function listColumns(table) {
  const { rows } = await pool.query(
    "select column_name, data_type, is_nullable from information_schema.columns where table_schema = 'public' and table_name = $1 order by ordinal_position",
    [table],
  );
  return rows;
}

(async () => {
  try {
    console.log("==================== DB DIAGNOSTIC ====================");
    for (const table of ["Product", "Category"]) {
      const cols = await listColumns(table);
      if (cols.length === 0) {
        console.log(`[${table}] TABLE NOT FOUND in schema public`);
        continue;
      }
      console.log(`[${table}] columns: ${cols.map((c) => c.column_name).join(", ")}`);
    }
    const expectedProduct = [
      "id", "code", "slug", "name", "description", "seoTitle", "seoDescription",
      "price", "baseCost", "retailMarginPct", "wholesaleMarginPct", "wholesalePrice",
      "minWholesaleQty", "categoryId", "thumbnailUrl", "createdAt", "updatedAt",
    ];
    const productCols = (await listColumns("Product")).map((c) => c.column_name);
    const missing = expectedProduct.filter((c) => !productCols.includes(c));
    console.log(`[Product] MISSING columns: ${missing.length ? missing.join(", ") : "(none)"}`);
    console.log("======================================================");
  } catch (err) {
    console.error("DB DIAGNOSTIC error:", err.message);
  } finally {
    await pool.end();
  }
})();
