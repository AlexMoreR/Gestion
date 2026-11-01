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
import {
  SupplierPaymentDraftUsedError,
  lookupPaymentDraft,
  receiveSupplierPaymentReceipt,
  type PaymentDraftView,
} from "./register-supplier-payment-by-voice";
import { computeOfBalance, isLikelyDuplicate, type RecentSupplierPayment } from "../domain/supplier-payment";
import { buildDraftToken } from "../../../lib/expense-draft-token";

const KEY = "clave-de-prueba-0123456789";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

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
  drafts: Array<PaymentDraftView & { tokenHash: string }> = [];
  receipts = new Map<string, string>();
  saved: string[] = [];
  removed: string[] = [];
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
      world.drafts.push({
        id: `d-${id}`,
        tokenHash: input.receiptDraft.tokenHash,
        ledgerEntryId: id,
        expiraEn: input.receiptDraft.expiraEn,
        usadoEn: null,
        ofCode: OF.code,
        supplierName: OF.supplier.name,
        amount: input.amount,
        paymentDate: input.paymentDate,
      });
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
    siteUrl: (path) => `https://magilus.com${path}`,
    findDraftByTokenHash: async (hash) => world.drafts.find((draft) => draft.tokenHash === hash) ?? null,
    attachReceipt: async (draftId, receipt) => {
      const draft = world.drafts.find((item) => item.id === draftId)!;
      if (draft.usadoEn) throw new SupplierPaymentDraftUsedError();
      draft.usadoEn = NOW;
      world.receipts.set(receipt.ledgerEntryId, receipt.url);
    },
    receiptStore: {
      save: async (file) => {
        const url = `/uploads/suppliers/payments/${world.saved.length + 1}.png`;
        world.saved.push(url);
        return { url, name: file.name };
      },
      remove: async (url) => {
        world.removed.push(url);
      },
    },
    now: () => NOW,
    tokenKey: KEY,
    newToken: () => buildDraftToken(KEY),
  };
}

const tokenOf = (url: string) => url.split("/").pop()!;

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
    expect(result.uploadUrl).toMatch(/^https:\/\/magilus\.com\/proveedores-pago\/soporte\//);
    expect(result.expiresAt.getTime() - NOW.getTime()).toBe(24 * 60 * 60_000);
    expect(world.drafts).toHaveLength(1);
  });

  it("el enlace de la foto solo aparece al confirmar", async () => {
    const prepared = await prepareSupplierPayment(deps, base);
    expect(prepared).not.toHaveProperty("uploadUrl");
    expect(world.drafts).toHaveLength(0);
  });

  it("la foto se pega una sola vez; un token inventado o un archivo raro no pasan", async () => {
    const { uploadUrl, paymentId } = await confirmSupplierPayment(deps, base);
    const token = tokenOf(uploadUrl);
    expect((await lookupPaymentDraft(deps, "inventado.xxx")).ok).toBe(false);
    const raro = await receiveSupplierPaymentReceipt(deps, token, new File([new Uint8Array([1, 2, 3, 4])], "x.png"));
    expect(raro).toMatchObject({ ok: false, canRetry: true });
    const first = await receiveSupplierPaymentReceipt(deps, token, new File([PNG], "comprobante.png"));
    expect(first).toEqual({ ok: true, summary: "OF-00035 · P-03 Laura · $300.000" });
    expect(world.receipts.get(paymentId)).toBe("/uploads/suppliers/payments/1.png");
    const second = await receiveSupplierPaymentReceipt(deps, token, new File([PNG], "otra.png"));
    expect(second).toMatchObject({ ok: false, canRetry: false });
    expect(world.saved).toHaveLength(1);
  });

  it("si dos envios llegan a la vez, el segundo no pega la foto y se borra su archivo", async () => {
    const { uploadUrl } = await confirmSupplierPayment(deps, base);
    deps.findDraftByTokenHash = async (hash) => {
      const draft = world.drafts.find((item) => item.tokenHash === hash);
      return draft ? { ...draft, usadoEn: null } : null; // los dos leen el borrador sin usar
    };
    await receiveSupplierPaymentReceipt(deps, tokenOf(uploadUrl), new File([PNG], "a.png"));
    const second = await receiveSupplierPaymentReceipt(deps, tokenOf(uploadUrl), new File([PNG], "b.png"));
    expect(second).toMatchObject({ ok: false, canRetry: false });
    expect(world.removed).toEqual(["/uploads/suppliers/payments/2.png"]);
  });

  it("un enlace vencido lo dice", async () => {
    const { uploadUrl } = await confirmSupplierPayment(deps, base);
    deps.now = () => new Date(NOW.getTime() + 25 * 60 * 60_000);
    const lookup = await lookupPaymentDraft(deps, tokenOf(uploadUrl));
    expect(lookup).toMatchObject({ ok: false });
    expect(lookup.ok ? "" : lookup.reason).toContain("venció");
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
