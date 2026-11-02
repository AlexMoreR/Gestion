import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Lo que tiene plata (o la sostiene) no se borra a secas: se anula con motivo en src/lib/anulaciones.ts.
const BORRADO_PROHIBIDO =
  /\.(salePayment|shippingCost|supplierLedgerEntry|expense|inventoryMovement|sale|order|dispatch)\.(delete|deleteMany)\(/g;
const RAIZ = path.resolve(__dirname, "../..");
const CARPETAS = ["src/app", "src/modules", "src/lib"];
const PERMITIDO = path.join("src", "lib", "anulaciones.ts");

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = path.join(dir, nombre);
    if (statSync(ruta).isDirectory()) return archivos(ruta);
    return /\.(ts|tsx)$/.test(nombre) ? [ruta] : [];
  });
}

function buscarBorrados(raiz: string): string[] {
  const hallazgos: string[] = [];
  for (const carpeta of CARPETAS) {
    for (const ruta of archivos(path.join(raiz, carpeta))) {
      const relativa = path.relative(raiz, ruta);
      if (relativa === PERMITIDO) continue;
      readFileSync(ruta, "utf8")
        .split("\n")
        .forEach((linea, i) => {
          if (linea.match(BORRADO_PROHIBIDO)) hallazgos.push(`${relativa}:${i + 1}: ${linea.trim()}`);
        });
    }
  }
  return hallazgos;
}

describe("vigilante de borrados", () => {
  it("nadie borra abonos, fletes, movimientos, gastos, ventas, órdenes ni despachos fuera de anulaciones.ts", () => {
    expect(buscarBorrados(RAIZ)).toEqual([]);
  });

  it("el patrón sí detecta un borrado", () => {
    expect("await tx.salePayment.deleteMany({})".match(BORRADO_PROHIBIDO)).not.toBeNull();
    expect("await prisma.order.delete({ where })".match(BORRADO_PROHIBIDO)).not.toBeNull();
    expect("await tx.orderItem.deleteMany({})".match(BORRADO_PROHIBIDO)).toBeNull();
  });
});
