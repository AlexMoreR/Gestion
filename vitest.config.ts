import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

// `npm test`: pruebas sin base. Las de base real (*.db.test.ts) van con `npm run test:db`.
// scripts/revisor usa node:test (corre con `node --test`), no Vitest.
export default defineConfig({
  // Para pruebas que cargan el servidor MCP completo (tools.ts usa "@/").
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: [...configDefaults.include, "tests/**/*.test.ts"],
    exclude: [...configDefaults.exclude, "tests/db/**/*.db.test.ts", "scripts/revisor/**", "scripts/corregir-nombres-productos.test.mjs", "scripts/camilla-al-inicio-nombres.test.mjs", "scripts/seo-mesa-manicura-tarimas.test.mjs", "scripts/seo-camilla-curva-lashista.test.mjs", "scripts/corregir-combos-lote-ord-116.test.mjs"],
  },
});
