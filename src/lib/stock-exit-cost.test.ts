import { describe, expect, it, vi } from "vitest";

// Vitest no resuelve "@/": la prueba pasa su propia base falsa.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { computeStockExitCost } from "./stock-exit-cost";

type Movement = { change: number; purchaseCode: string | null; ledgerEntries: Array<{ amount: number; code: string | null }> };

function fakeDb(movements: Movement[], stock: number) {
  return {
    product: { findUnique: async () => ({ baseCost: 500000, additionalCost: 50000 }) },
    inventoryMovement: {
      findMany: async () => movements,
      aggregate: async () => ({ _sum: { change: stock } }),
    },
    order: {
      findMany: async () => [
        { code: "ORD-00092", purchaseCode: "COM-00010", items: [{ quantity: 2, purchaseCost: 600000 }] },
      ],
    },
  } as never;
}

describe("computeStockExitCost", () => {
  it("usa lo que cobró la proveedora en la compra, sin flete", async () => {
    const db = fakeDb([{ change: 2, purchaseCode: "COM-00010", ledgerEntries: [] }], 2);
    expect(await computeStockExitCost({ productId: "p", quantity: 1 }, db)).toEqual({ unitCost: 600000, source: "ORD-00092" });
  });

  it("sin orden de compra usa el cargo ligado a la entrada; sin compra, catálogo", async () => {
    const db = fakeDb(
      [
        { change: 1, purchaseCode: null, ledgerEntries: [] },
        { change: 2, purchaseCode: null, ledgerEntries: [{ amount: 900000, code: "INV-00005" }] },
      ],
      3,
    );
    expect(await computeStockExitCost({ productId: "p", quantity: 1 }, db)).toEqual({ unitCost: 550000, source: "catálogo" });
    expect(await computeStockExitCost({ productId: "p", quantity: 1, alreadyTaken: 1 }, db)).toEqual({
      unitCost: 450000,
      source: "INV-00005",
    });
  });
});
