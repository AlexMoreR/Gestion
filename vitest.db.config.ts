import path from "node:path";
import { defineConfig } from "vitest/config";

// `npm run test:db`: server actions de verdad contra un Postgres desechable (DATABASE_URL local).
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["tests/db/**/*.db.test.ts"],
    globalSetup: ["tests/db/global-setup.ts"],
    // Un solo proceso y en orden: los pasos comparten la base.
    pool: "forks",
    fileParallelism: false,
    // Un paso que falla deja la base a medias: se para ahí.
    bail: 1,
    // Cada paso con su nombre en la salida.
    reporters: ["verbose"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
