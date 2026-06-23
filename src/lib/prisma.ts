import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  pgPool?: InstanceType<typeof Pool>;
};
const connectionString = process.env.DATABASE_URL;

// Pool reutilizado entre hot-reloads de dev para no agotar conexiones.
let pool = globalForPrisma.pgPool;
if (!pool) {
  pool = new Pool({
    connectionString,
    // Mantiene viva la conexion TCP para que el servidor no la cierre por inactividad.
    keepAlive: true,
    max: 5,
    // Recicla conexiones ociosas antes de que el servidor remoto las mate.
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  // Una conexion ociosa que el servidor cierra no debe tumbar el proceso.
  pool.on("error", (error: Error) => {
    console.error("[pg] idle client error:", error.message);
  });
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg(pool),
    log: ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.pgPool = pool;
}
