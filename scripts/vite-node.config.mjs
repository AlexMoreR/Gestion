// Config de vite-node para scripts que importan codigo de la app (ej. combo:rellenar):
// resuelve el alias "@/" y deja vacio "server-only" (fuera de Next ese paquete lanza error).
import { fileURLToPath } from "node:url";

const src = fileURLToPath(new URL("../src/", import.meta.url));

export default {
  resolve: { alias: [{ find: /^@\//, replacement: src }] },
  plugins: [
    {
      name: "server-only-vacio",
      enforce: "pre",
      resolveId: (id) => (id === "server-only" ? "\0server-only" : null),
      load: (id) => (id === "\0server-only" ? "export {};" : null),
    },
  ],
};
