import { describe, expect, it } from "vitest";
import { getSaleUseCase, type AsesorDependencies } from "./use-cases";
import type { SaleLedgerInput } from "../domain/payments";

const input: SaleLedgerInput = {
  saleId: "s81",
  saleCode: "SAL-00081",
  quoteCode: "COT-00150",
  quoteCreatedAt: new Date("2026-10-01T15:00:00Z"),
  saleCreatedAt: new Date("2026-10-02T15:00:00Z"),
  clientName: "Cliente",
  sellerName: "Ingrid",
  saleStatus: "ACTIVE",
  orderStatus: null,
  paymentMethod: "ANTICIPO_50_50",
  total: 100_000,
  recordedPaid: 0,
  deliveredAt: null,
  payments: [],
};

const deps = {
  asesor: {
    listSaleLedgers: async (filter?: { saleCodes?: string[] }) =>
      filter?.saleCodes?.includes("SAL-00081") ? [input] : [],
    getSaleDetails: async () => [],
  },
  balances: { calculateSaleProfit: async () => null },
} as unknown as AsesorDependencies;

describe("ver_venta", () => {
  it("devuelve los códigos sin ceros adelante, se pida como se pida", async () => {
    for (const codigo of ["SAL-81", "SAL-00081", "81"]) {
      const result = await getSaleUseCase(deps, codigo);
      expect(result.venta).toBe("SAL-81");
      expect(result.cotizacion).toBe("COT-150");
    }
  });
});
