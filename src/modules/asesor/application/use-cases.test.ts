import { describe, expect, it } from "vitest";
import { getActivityHistoryUseCase, getSaleUseCase, type AsesorDependencies } from "./use-cases";
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

describe("historial_de_registro", () => {
  const pedidos: unknown[] = [];
  const historyDeps = {
    asesor: {
      activityHistory: async (filter: unknown) => {
        pedidos.push(filter);
        return [
          { kind: "estado", at: new Date("2026-10-30T15:00:00Z"), persona: "Ingrid", orderCode: "ORD-00092", fromStatus: null, toStatus: "RELEASED", note: null },
          { kind: "actividad", at: new Date("2026-10-30T14:04:00Z"), persona: "Fulana", origin: null, summary: "Editó la compra COM-00010", before: null, after: null, ticket: null, commitSha: null },
        ];
      },
    },
  } as unknown as AsesorDependencies;

  it("por código o por fecha devuelve las líneas en orden de hora, con códigos sin ceros", async () => {
    const porCodigo = await getActivityHistoryUseCase(historyDeps, { codigo: "com-10" });
    expect(porCodigo.lineas).toEqual([
      "30-oct 9:04 a. m. — Fulana (pantalla) editó la compra COM-10",
      "30-oct 10:00 a. m. — Ingrid cambió la ORD-92 a Liberada",
    ]);
    await getActivityHistoryUseCase(historyDeps, { fecha: "2026-10-30" });
    expect(pedidos).toEqual([{ codigo: "com-10" }, { fecha: "2026-10-30" }]);
  });

  it("exige código o fecha (uno solo) y una fecha válida", async () => {
    await expect(getActivityHistoryUseCase(historyDeps, {})).rejects.toThrow("uno de los dos");
    await expect(getActivityHistoryUseCase(historyDeps, { codigo: "SAL-1", fecha: "2026-10-30" })).rejects.toThrow("uno de los dos");
    await expect(getActivityHistoryUseCase(historyDeps, { fecha: "2026-02-30" })).rejects.toThrow("no es una fecha valida");
  });
});
