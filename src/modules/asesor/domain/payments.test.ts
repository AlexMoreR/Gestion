import { describe, expect, it } from "vitest";
import {
  bogotaDay,
  buildSaleLedger,
  matchesPaymentStatus,
  matchesText,
  normalizeSaleCode,
  type SaleLedgerInput,
} from "./payments";

// Fechas como las guarda Gestion: el abono escrito a mano queda a las 12:00 de Colombia (17:00 UTC).
const writtenDay = (day: string) => new Date(`${day}T17:00:00.000Z`);
const at = (iso: string) => new Date(iso);

function sale(overrides: Partial<SaleLedgerInput> = {}): SaleLedgerInput {
  return {
    saleId: "s1",
    saleCode: "SAL-00001",
    quoteCode: "COT-00001",
    quoteCreatedAt: at("2026-09-30T15:00:00.000Z"),
    saleCreatedAt: at("2026-10-02T15:00:00.000Z"),
    clientName: "Cliente",
    sellerName: "Ingrid Sanchez",
    saleStatus: "ACTIVE",
    orderStatus: "IN_PRODUCTION",
    paymentMethod: "ANTICIPO_50_50",
    total: 1_000_000,
    recordedPaid: 0,
    deliveredAt: null,
    payments: [],
    ...overrides,
  };
}

describe("bogotaDay", () => {
  it("usa el dia de Colombia, no el de UTC", () => {
    // 1-oct 03:00 UTC = 30-sep 22:00 en Colombia.
    expect(bogotaDay(at("2026-10-01T03:00:00.000Z"))).toBe("2026-09-30");
    expect(bogotaDay(writtenDay("2026-10-02"))).toBe("2026-10-02");
  });
});

describe("buildSaleLedger", () => {
  it("cotizacion de septiembre con primer abono en octubre y saldo pendiente", () => {
    const ledger = buildSaleLedger(
      sale({
        recordedPaid: 500_000,
        payments: [
          {
            amount: 500_000,
            paymentDate: writtenDay("2026-10-02"),
            registeredAt: at("2026-10-02T16:00:00.000Z"),
            accountName: "Bancolombia",
            method: "Bancolombia",
            note: null,
          },
        ],
      }),
    );

    expect(bogotaDay(ledger.firstPaymentAt!)).toBe("2026-10-02");
    expect(ledger.paid).toBe(500_000);
    expect(ledger.balance).toBe(500_000);
    expect(ledger.fullyPaidAt).toBeNull();
    expect(ledger.countsInBalances).toBe(false);
    expect(ledger.payments[0]).toMatchObject({ isFirst: true, retroactive: false, beforeQuote: false });
    expect(matchesPaymentStatus(ledger, "pendientes")).toBe(true);
    expect(matchesPaymentStatus(ledger, "pagadas")).toBe(false);
  });

  it("marca retroactivo y antes de la cotizacion un abono con fecha escrita hacia atras", () => {
    // Caso tipo Emily: cotizacion del 30-sep, abono escrito como 26-sep y registrado el 2-oct.
    const ledger = buildSaleLedger(
      sale({
        total: 989_000,
        recordedPaid: 989_000,
        saleStatus: "INVOICED",
        payments: [
          {
            amount: 989_000,
            paymentDate: writtenDay("2026-09-26"),
            registeredAt: at("2026-10-02T16:00:00.000Z"),
            accountName: "Nequi",
            method: "Nequi",
            note: null,
          },
        ],
      }),
    );

    expect(ledger.payments[0]).toMatchObject({ retroactive: true, beforeQuote: true });
    expect(bogotaDay(ledger.fullyPaidAt!)).toBe("2026-09-26");
    expect(ledger.countsInBalances).toBe(true);
    expect(ledger.balance).toBe(0);
  });

  it("no marca retroactivo un abono registrado el mismo dia, aunque sea tarde en la noche", () => {
    const ledger = buildSaleLedger(
      sale({
        payments: [
          {
            amount: 100_000,
            paymentDate: writtenDay("2026-10-05"),
            // 5-oct 23:30 en Colombia = 6-oct 04:30 UTC.
            registeredAt: at("2026-10-06T04:30:00.000Z"),
            accountName: null,
            method: null,
            note: null,
          },
        ],
      }),
    );

    expect(ledger.payments[0].retroactive).toBe(false);
  });

  it("toma lo pagado sin detalle de ventas viejas como un abono en la fecha de la venta", () => {
    const ledger = buildSaleLedger(sale({ recordedPaid: 300_000, payments: [] }));

    expect(ledger.paid).toBe(300_000);
    expect(ledger.payments).toHaveLength(1);
    expect(ledger.payments[0]).toMatchObject({ legacy: true, isFirst: true, amount: 300_000 });
  });

  it("ordena los abonos y marca solo el mas antiguo como primero", () => {
    const ledger = buildSaleLedger(
      sale({
        recordedPaid: 1_000_000,
        payments: [
          { amount: 500_000, paymentDate: writtenDay("2026-10-10"), registeredAt: writtenDay("2026-10-10"), accountName: null, method: null, note: "saldo" },
          { amount: 500_000, paymentDate: writtenDay("2026-10-01"), registeredAt: writtenDay("2026-10-01"), accountName: null, method: null, note: "anticipo" },
        ],
      }),
    );

    expect(ledger.payments.map((payment) => payment.note)).toEqual(["anticipo", "saldo"]);
    expect(ledger.payments.map((payment) => payment.isFirst)).toEqual([true, false]);
    expect(bogotaDay(ledger.fullyPaidAt!)).toBe("2026-10-10");
  });

  it("contraentrega pagada pero sin entregar sigue pendiente; entregada ya cuenta", () => {
    const base = sale({
      paymentMethod: "CONTRAENTREGA",
      recordedPaid: 1_000_000,
      payments: [
        { amount: 1_000_000, paymentDate: writtenDay("2026-10-03"), registeredAt: writtenDay("2026-10-03"), accountName: null, method: null, note: null },
      ],
    });

    expect(buildSaleLedger(base).countsInBalances).toBe(false);
    expect(
      buildSaleLedger({ ...base, orderStatus: "COMPLETED", deliveredAt: writtenDay("2026-10-04") }).countsInBalances,
    ).toBe(true);
  });

  it("una venta cancelada no aparece como pagada ni pendiente", () => {
    const ledger = buildSaleLedger(sale({ saleStatus: "CANCELLED" }));

    expect(ledger.cancelled).toBe(true);
    expect(matchesPaymentStatus(ledger, "todas")).toBe(false);
    expect(matchesPaymentStatus(ledger, "pendientes")).toBe(false);
  });
});

describe("matchesText", () => {
  it("busca sin tildes ni mayusculas", () => {
    expect(matchesText("Ingrid Sánchez", "ingrid")).toBe(true);
    expect(matchesText("Fundación Colombo Germana", "fundacion")).toBe(true);
    expect(matchesText("Maria Camila", "ingrid")).toBe(false);
    expect(matchesText(null, undefined)).toBe(true);
  });
});

describe("normalizeSaleCode", () => {
  it("acepta el codigo completo, en minuscula o solo el numero", () => {
    expect(normalizeSaleCode("SAL-00069")).toBe("SAL-00069");
    expect(normalizeSaleCode("sal-69")).toBe("SAL-00069");
    expect(normalizeSaleCode("69")).toBe("SAL-00069");
  });
});
