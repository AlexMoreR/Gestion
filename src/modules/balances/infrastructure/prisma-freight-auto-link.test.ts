import { beforeEach, describe, expect, it, vi } from "vitest";

// Base en memoria: solo lo que usa el cruce (sin conectarse a ninguna base).
const db = vi.hoisted(() => {
  const state = {
    settings: new Map<string, string>(),
    freights: [] as Array<{ id: string; saleId: string; shippingProvider: string; amount: number; paymentDate: Date; accountId: string | null; supplierPaymentId: string | null; sale: { code: string; order: { id: string } | null } }>,
    payments: [] as Array<{ id: string; saleId: string | null; orderId: string | null; amount: number; paymentDate: Date; createdAt: Date; accountId: string | null; order: null; supplier: { name: string; type: string } }>,
    logs: [] as Array<{ entityId: string; summary: string }>,
  };
  const client = {
    $executeRaw: async () => 0,
    appSetting: {
      findUnique: async ({ where }: { where: { key: string } }) =>
        state.settings.has(where.key) ? { value: state.settings.get(where.key)! } : null,
      create: async ({ data }: { data: { key: string; value: string } }) => state.settings.set(data.key, data.value),
    },
    shippingCost: {
      findMany: async () => state.freights.filter((row) => !row.accountId && !row.supplierPaymentId),
      updateMany: async ({ where, data }: { where: { id: string }; data: { supplierPaymentId: string } }) => {
        const row = state.freights.find((item) => item.id === where.id && !item.accountId && !item.supplierPaymentId);
        if (row) row.supplierPaymentId = data.supplierPaymentId;
        return { count: row ? 1 : 0 };
      },
    },
    supplierLedgerEntry: {
      findMany: async () =>
        state.payments.filter((p) => p.accountId && !state.freights.some((f) => f.supplierPaymentId === p.id)),
    },
    activityLog: {
      create: async ({ data }: { data: { entityId: string; summary: string } }) => state.logs.push(data),
    },
    $transaction: async (fn: (tx: unknown) => unknown) => fn(client),
  };
  return { state, client };
});
vi.mock("@/lib/prisma", () => ({ prisma: db.client }));

import { FREIGHT_AUTO_LINK_KEY, runFreightAutoLinkSafely } from "./prisma-freight-auto-link";

const day = new Date(Date.UTC(2026, 5, 10, 12));

describe("runFreightAutoLinkSafely", () => {
  beforeEach(() => {
    db.state.settings.clear();
    db.state.logs.length = 0;
    db.state.freights = [
      { id: "flete-1", saleId: "sal-1", shippingProvider: "P-06 Eliecer", amount: 185_000, paymentDate: day, accountId: null, supplierPaymentId: null, sale: { code: "SAL-1", order: { id: "ord-1" } } },
      { id: "flete-sin-pareja", saleId: "sal-2", shippingProvider: "OLT Carga", amount: 90_000, paymentDate: day, accountId: null, supplierPaymentId: null, sale: { code: "SAL-2", order: null } },
    ];
    db.state.payments = [
      { id: "pago-1", saleId: "sal-1", orderId: null, amount: 185_000, paymentDate: day, createdAt: day, accountId: "cta", order: null, supplier: { name: "P-06 Eliecer", type: "SHIPPING" } },
    ];
  });

  it("une el flete con su pago, anota la bitacora y guarda la marca una sola vez", async () => {
    const first = await runFreightAutoLinkSafely();
    expect(first).toMatchObject({ linked: 1, amount: 185_000 });
    expect(db.state.freights.find((row) => row.id === "flete-1")?.supplierPaymentId).toBe("pago-1");
    expect(db.state.freights.find((row) => row.id === "flete-sin-pareja")?.supplierPaymentId).toBeNull();
    expect(db.state.logs).toHaveLength(1);
    expect(db.state.logs[0].summary).toContain("flete-1");
    expect(db.state.logs[0].summary).toContain("pago-1");
    expect(db.state.settings.has(FREIGHT_AUTO_LINK_KEY)).toBe(true);

    // Recargar no vuelve a correr el cruce: devuelve el mismo resultado y no anota nada nuevo.
    db.state.payments.push({ ...db.state.payments[0], id: "pago-2", saleId: "sal-2", amount: 90_000 });
    expect(await runFreightAutoLinkSafely()).toEqual(first);
    expect(db.state.logs).toHaveLength(1);
    expect(db.state.freights.find((row) => row.id === "flete-sin-pareja")?.supplierPaymentId).toBeNull();
  });
});
