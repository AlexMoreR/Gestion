import { beforeEach, describe, expect, it } from "vitest";
import {
  SupplierPaymentDuplicateError,
  SupplierPaymentInputError,
  confirmSupplierPayment,
  prepareSupplierPayment,
  type NewSupplierPayment,
  type OfInfo,
  type SupplierPaymentDeps,
} from "./register-supplier-payment-by-voice";
import { computeOfBalance, isLikelyDuplicate, type RecentSupplierPayment } from "../domain/supplier-payment";

const NOW = new Date("2026-10-24T15:00:00Z"); // 10:00 en Colombia, dia 2026-10-24

const OF: OfInfo = {
  id: "of-35",
  code: "OF-00035",
  orderId: "ord-1",
  orderStatus: "IN_PRODUCTION",
  saleId: "sale-1",
  saleCode: "SAL-00081",
  paymentMethod: "ANTICIPO_50_50",
  supplier: { id: "sup-laura", name: "P-03 Laura" },
};

// Mundo en memoria: cargos y abonos de la OF. No hay gastos: las dependencias no los exponen.
class World {
  charges = [600000];
  payments: Array<NewSupplierPayment & { id: string; createdAt: Date }> = [];
  paidMarked = 0;
  logs: string[] = [];
  balance() {
    return computeOfBalance({ charges: this.charges, payments: this.payments.map((p) => p.amount), lineSubtotals: [] });
  }
  recent(): RecentSupplierPayment[] {
    return this.payments.map((p) => ({ ofId: OF.id, monto: p.amount, fecha: p.paymentDate, creadoEn: p.createdAt }));
  }
}

function makeDeps(world: World): SupplierPaymentDeps {
  return {
    findOfByCode: async (code) => (code === OF.code ? { ...OF } : null),
    listAccounts: async () => [
      { id: "acc-caja", name: "Caja", type: "CASH" },
      { id: "acc-banco", name: "Bancolombia", type: "BANK" },
    ],
    getBalance: async () => world.balance(),
    recentPayments: async () => world.recent(),
    createPayment: async (_of, input, nuevo) => {
      if (isLikelyDuplicate(nuevo, world.recent())) throw new SupplierPaymentDuplicateError();
      const id = `pay-${world.payments.length + 1}`;
      world.payments.push({ ...input, id, createdAt: nuevo.creadoEn });
      return { id };
    },
    markItemsPaidIfSettled: async () => {
      const balance = world.balance();
      if (balance.costoConfirmado && balance.falta === 0) world.paidMarked += 1;
      return balance;
    },
    resolveActor: async () => ({ id: "u-alex", name: "Alex", email: null }),
    logActivity: async (_actor, entry) => {
      world.logs.push(entry.summary);
    },
    now: () => NOW,
  };
}

const base = { of: "of-00035", monto: 300000, cuenta: "banco" };

describe("registrar pago a la proveedora por voz", () => {
  let world: World;
  let deps: SupplierPaymentDeps;
  beforeEach(() => {
    world = new World();
    deps = makeDeps(world);
  });

  it("con confirmado=false no guarda y arma el resumen", async () => {
    const prepared = await prepareSupplierPayment(deps, base);
    expect(world.payments).toHaveLength(0);
    expect(prepared.of.code).toBe("OF-00035");
    expect(prepared.account.name).toBe("Bancolombia");
    expect(prepared.day).toBe("2026-10-24");
    expect(prepared.balance).toMatchObject({ costo: 600000, pagado: 0, falta: 600000 });
  });

  it("con confirmado=true guarda un solo abono, sin gasto, y lo anota en la bitacora", async () => {
    const result = await confirmSupplierPayment(deps, { ...base, nota: "transferencia" });
    expect(world.payments).toHaveLength(1);
    expect(world.payments[0]).toMatchObject({
      supplierId: "sup-laura",
      orderId: "ord-1",
      saleId: "sale-1",
      accountId: "acc-banco",
      amount: 300000,
      note: "transferencia",
      createdById: "u-alex",
    });
    expect(world.payments[0].paymentDate.toISOString()).toBe("2026-10-24T12:00:00.000Z");
    expect(result).toMatchObject({ paymentId: "pay-1", balance: { pagado: 300000, falta: 300000 } });
    expect(world.logs).toEqual(["Registró un pago de $300.000 a P-03 Laura por OF-00035 (por Claude)"]);
    expect(Object.keys(deps)).not.toContain("expenses");
    expect(world.paidMarked).toBe(0);
  });

  it("rechaza el duplicado (misma OF, monto y dia, a los pocos minutos)", async () => {
    await confirmSupplierPayment(deps, base);
    const preview = await prepareSupplierPayment(deps, base);
    expect(preview.duplicado).toBe(true);
    await expect(confirmSupplierPayment(deps, base)).rejects.toBeInstanceOf(SupplierPaymentDuplicateError);
    expect(world.payments).toHaveLength(1);
  });

  it("OF inexistente o cuenta inexistente", async () => {
    await expect(prepareSupplierPayment(deps, { ...base, of: "OF-99999" })).rejects.toThrow("No existe la orden");
    await expect(prepareSupplierPayment(deps, { ...base, cuenta: "nequi" })).rejects.toBeInstanceOf(SupplierPaymentInputError);
    expect(world.payments).toHaveLength(0);
  });

  it("sobrepago sin motivo se rechaza; con motivo pasa con aviso", async () => {
    await expect(confirmSupplierPayment(deps, { ...base, monto: 700000 })).rejects.toThrow("mayor que lo que falta");
    const prepared = await prepareSupplierPayment(deps, { ...base, monto: 700000, motivoSobrepago: "anticipo del siguiente" });
    expect(prepared.avisos.join(" ")).toContain("mayor que lo que falta");
    expect(world.payments).toHaveLength(0);
  });

  it("fecha anterior exige motivo y fecha futura no se acepta", async () => {
    await expect(prepareSupplierPayment(deps, { ...base, fecha: "2026-10-20" })).rejects.toThrow("motivo");
    await expect(prepareSupplierPayment(deps, { ...base, fecha: "2026-10-25" })).rejects.toThrow("futura");
  });

  it("marca PAID al saldar lo que falta", async () => {
    const result = await confirmSupplierPayment(deps, { ...base, monto: 600000 });
    expect(result.balance.falta).toBe(0);
    expect(world.paidMarked).toBe(1);
  });

  it("avisa (sin bloquear) si la venta es contraentrega y aun no se entrega", async () => {
    deps.findOfByCode = async () => ({ ...OF, paymentMethod: "CONTRAENTREGA" });
    const prepared = await prepareSupplierPayment(deps, base);
    expect(prepared.avisos.join(" ")).toContain("contraentrega");
  });
});
