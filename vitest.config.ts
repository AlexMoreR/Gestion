import { configDefaults, defineConfig } from "vitest/config";

// `npm test`: pruebas sin base. Las de base real (*.db.test.ts) van con `npm run test:db`.
// scripts/revisor usa node:test (corre con `node --test`), no Vitest.
export default defineConfig({
  test: {
    include: [...configDefaults.include, "tests/**/*.test.ts"],
    exclude: [...configDefaults.exclude, "tests/db/**/*.db.test.ts", "scripts/revisor/**", "scripts/corregir-nombres-productos.test.mjs", "scripts/camilla-al-inicio-nombres.test.mjs"],
  },
});
