import { configDefaults, defineConfig } from "vitest/config";

// `npm test`: pruebas sin base. Las de base real (*.db.test.ts) van con `npm run test:db`.
export default defineConfig({
  test: {
    include: [...configDefaults.include, "tests/**/*.test.ts"],
    exclude: [...configDefaults.exclude, "tests/db/**/*.db.test.ts"],
  },
});
