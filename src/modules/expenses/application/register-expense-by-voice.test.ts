import { beforeEach, describe, expect, it } from "vitest";
import {
  confirmVoiceExpense,
  prepareVoiceExpense,
  receiveVoiceExpenseReceipt,
  type VoiceExpenseDeps,
} from "./register-expense-by-voice";
import {
  DRAFT_TTL_MINUTES,
  ExpenseDraftInputError,
  ExpenseDraftUsedError,
  type AccountOption,
} from "../domain/expense-draft";
import type {
  CreateExpenseInput,
  ExpenseDraftRepository,
  ExpenseDraftView,
  NewExpenseDraft,
} from "../domain/repository";
import type { Expense, ExpenseCategory } from "../domain/entities";
import { buildDraftToken } from "../../../lib/expense-draft-token";

const NOW = new Date("2026-10-24T15:00:00Z"); // 10:00 en Colombia, dia 2026-10-24
const KEY = "clave-de-prueba-0123456789";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const ACCOUNTS: AccountOption[] = [
  { id: "acc-caja", name: "Caja", type: "CASH" },
  { id: "acc-banco", name: "Bancolombia", type: "BANK" },
];

type StoredDraft = ExpenseDraftView & { tokenHash: string };

// Repositorio en memoria de borradores y gastos.
class MemoryWorld {
  drafts: StoredDraft[] = [];
  expenses: Expense[] = [];
  createCalls: CreateExpenseInput[] = [];
  saved: string[] = [];
  removed: string[] = [];
  logs: string[] = [];
  attached: string[] = [];
  failDraftCreate = false;
  private seq = 0;

  draftsRepo: ExpenseDraftRepository = {
    create: async (input: NewExpenseDraft) => {
      if (this.failDraftCreate) throw new Error("BD caida");
      this.seq += 1;
      const account = ACCOUNTS.find((item) => item.id === input.accountId)!;
      this.drafts.push({
        id: `d${this.seq}`,
        tokenHash: input.tokenHash,
        status: "PENDIENTE",
        expenseId: input.expenseId,
        savedOnConfirm: true,
        amount: input.amount,
        expenseDate: input.expenseDate,
        description: input.description,
        retroMotivo: input.retroMotivo,
        employeeId: input.employeeId,
        categoryId: input.categoryId,
        categoryName: "Marketing",
        accountId: input.accountId,
        accountName: account.name,
        accountType: account.type,
        createdById: input.createdById,
        createdByName: "Alex",
        expiresAt: input.expiresAt,
      });
      return { id: `d${this.seq}` };
    },
    findByTokenHash: async (hash) => {
      const found = this.drafts.find((draft) => draft.tokenHash === hash);
      return found ? { ...found } : null;
    },
    attachReceipt: async (draftId, receipt) => {
      const draft = this.drafts.find((item) => item.id === draftId)!;
      if (draft.status !== "PENDIENTE") throw new ExpenseDraftUsedError();
      const expense = this.expenses.find((item) => item.id === receipt.expenseId)!;
      expense.receiptUrl = receipt.url;
      expense.receiptName = receipt.name;
      draft.status = "GUARDADO";
      this.attached.push(receipt.expenseId);
    },
    markExpired: async (draftId) => {
      const draft = this.drafts.find((item) => item.id === draftId)!;
      if (draft.status === "PENDIENTE") draft.status = "VENCIDO";
    },
  };

  expensesRepo: VoiceExpenseDeps["expenses"] = {
    ensureCategoryByName: async (name): Promise<ExpenseCategory> => ({
      id: `cat-${name}`,
      name,
      description: null,
      isActive: true,
      createdAt: NOW,
    }),
    createExpense: async (input) => {
      this.createCalls.push(input);
      if (input.fromDraft) {
        const draft = this.drafts.find((item) => item.id === input.fromDraft!.id);
        if (!draft || draft.status !== "PENDIENTE") throw new ExpenseDraftUsedError();
        draft.status = "GUARDADO";
      }
      const expense: Expense = {
        id: `e${this.expenses.length + 1}`,
        categoryId: input.categoryId,
        accountId: input.accountId,
        amount: input.amount,
        description: input.description ?? null,
        reference: null,
        receiptUrl: input.receiptUrl ?? null,
        receiptName: input.receiptName ?? null,
        employeeId: input.employeeId ?? null,
        expenseDate: input.expenseDate,
        createdAt: NOW,
      };
      this.expenses.push(expense);
      return expense;
    },
  };
}

function makeDeps(world: MemoryWorld, clock: { now: Date }): VoiceExpenseDeps {
  return {
    expenses: world.expensesRepo,
    drafts: world.draftsRepo,
    listAccounts: async () => ACCOUNTS,
    findEmployees: async (query) => (query.includes("ingrid") ? [{ id: "u-ingrid", name: "Ingrid" }] : []),
    resolveActor: async () => ({ id: "u-alex", name: "Alex", email: null }),
    receiptStore: {
      save: async (file) => {
        const url = `/uploads/gastos/${world.saved.length + 1}${file.ext}`;
        world.saved.push(url);
        return { url, name: file.name };
      },
      remove: async (url) => {
        world.removed.push(url);
      },
    },
    siteUrl: (path) => `https://gestion.test${path}`,
    logActivity: async (_actor, entry) => {
      world.logs.push(entry.summary);
    },
    now: () => clock.now,
    tokenKey: KEY,
  };
}

const baseInput = { amount: 350_000, category: "publicidad", account: "banco" };

describe("prepareVoiceExpense", () => {
  let world: MemoryWorld;
  let deps: VoiceExpenseDeps;
  beforeEach(() => {
    world = new MemoryWorld();
    deps = makeDeps(world, { now: NOW });
  });

  it("arma el gasto con categoria y cuenta resueltas", async () => {
    const prepared = await prepareVoiceExpense(deps, baseInput);
    expect(prepared).toMatchObject({
      amount: 350_000,
      categoryName: "Marketing",
      day: "2026-10-24",
      retroReason: null,
      employee: null,
    });
    expect(prepared.account.id).toBe("acc-banco");
  });

  it("nomina sin persona se rechaza; con persona la busca", async () => {
    await expect(prepareVoiceExpense(deps, { ...baseInput, category: "nomina" })).rejects.toThrow(ExpenseDraftInputError);
    await expect(prepareVoiceExpense(deps, { ...baseInput, category: "nomina", person: "Zoe" })).rejects.toThrow(/Zoe/);
    const ok = await prepareVoiceExpense(deps, { ...baseInput, category: "nómina", person: "Ingrid" });
    expect(ok.employee).toEqual({ id: "u-ingrid", name: "Ingrid" });
  });

  it("fecha anterior sin motivo se rechaza; con motivo pasa", async () => {
    await expect(prepareVoiceExpense(deps, { ...baseInput, date: "2026-10-20" })).rejects.toThrow(ExpenseDraftInputError);
    const ok = await prepareVoiceExpense(deps, { ...baseInput, date: "2026-10-20", retroReason: "Se me olvido registrarlo" });
    expect(ok.retroReason).toBe("Se me olvido registrarlo");
  });

  it("fecha futura o inexistente se rechaza", async () => {
    await expect(prepareVoiceExpense(deps, { ...baseInput, date: "2026-10-25" })).rejects.toThrow(/futura/);
    await expect(prepareVoiceExpense(deps, { ...baseInput, date: "2026-02-31" })).rejects.toThrow(ExpenseDraftInputError);
  });

  it("respeta el tope de 20.000.000 y rechaza montos <= 0", async () => {
    await expect(prepareVoiceExpense(deps, { ...baseInput, amount: 20_000_001 })).rejects.toThrow(/tope/);
    await expect(prepareVoiceExpense(deps, { ...baseInput, amount: 20_000_000 })).resolves.toBeDefined();
    await expect(prepareVoiceExpense(deps, { ...baseInput, amount: 0 })).rejects.toThrow(ExpenseDraftInputError);
    await expect(prepareVoiceExpense(deps, { ...baseInput, amount: -10 })).rejects.toThrow(ExpenseDraftInputError);
    await expect(prepareVoiceExpense(deps, { ...baseInput, amount: Number.NaN })).rejects.toThrow(ExpenseDraftInputError);
  });

  it("categoria no valida y cuenta ambigua se rechazan", async () => {
    await expect(prepareVoiceExpense(deps, { ...baseInput, category: "viajes" })).rejects.toThrow(/no válida/);
    const ambiguous = makeDeps(world, { now: NOW });
    ambiguous.listAccounts = async () => [...ACCOUNTS, { id: "acc-b2", name: "Davivienda", type: "BANK" }];
    await expect(prepareVoiceExpense(ambiguous, baseInput)).rejects.toThrow(/Davivienda/);
  });
});

describe("confirmVoiceExpense", () => {
  it("guarda UN gasto sin foto (sin llave de Anthropic) y devuelve el enlace de 24 h", async () => {
    const world = new MemoryWorld();
    const deps = makeDeps(world, { now: NOW });
    const result = await confirmVoiceExpense(deps, baseInput);
    expect(world.expenses).toHaveLength(1);
    expect(world.expenses[0]).toMatchObject({ amount: 350_000, accountId: "acc-banco", receiptUrl: null });
    expect(result.expenseId).toBe(world.expenses[0].id);
    expect(world.logs).toEqual(["Registró un gasto de $350.000 (por Claude)"]);
    expect(result.uploadUrl).toMatch(/^https:\/\/gestion\.test\/gastos\/soporte\/[\w-]+\.[\w-]{22}$/);
    expect(DRAFT_TTL_MINUTES).toBe(24 * 60);
    expect(result.expiresAt.getTime()).toBe(NOW.getTime() + 24 * 60 * 60_000);
    expect(world.drafts).toHaveLength(1);
    expect(world.drafts[0]).toMatchObject({ status: "PENDIENTE", expenseId: "e1", savedOnConfirm: true });
    // En la BD solo queda el hash, nunca el token.
    expect(result.uploadUrl).not.toContain(world.drafts[0].tokenHash);
  });

  it("fecha anterior con motivo: guarda el gasto con su registro retroactivo", async () => {
    const world = new MemoryWorld();
    const deps = makeDeps(world, { now: NOW });
    await confirmVoiceExpense(deps, { ...baseInput, date: "2026-10-20", retroReason: "Se me olvido registrarlo" });
    expect(world.createCalls).toHaveLength(1);
    expect(world.createCalls[0].retroactivo).toMatchObject({
      fechaPuesta: "2026-10-20",
      motivo: "Se me olvido registrarlo",
    });
  });

  it("fecha de hoy: guarda el gasto sin registro retroactivo", async () => {
    const world = new MemoryWorld();
    const deps = makeDeps(world, { now: NOW });
    await confirmVoiceExpense(deps, { ...baseInput, date: "2026-10-24" });
    expect(world.createCalls[0].retroactivo ?? null).toBeNull();
  });

  it.each([
    ["monto sobre el tope", { amount: 20_000_001 }],
    ["categoria invalida", { category: "viajes" }],
    ["nomina sin persona", { category: "nomina" }],
    ["fecha anterior sin motivo", { date: "2026-10-20" }],
  ])("%s: no guarda nada", async (_name, patch) => {
    const world = new MemoryWorld();
    const deps = makeDeps(world, { now: NOW });
    await expect(confirmVoiceExpense(deps, { ...baseInput, ...patch })).rejects.toThrow(ExpenseDraftInputError);
    expect(world.expenses).toHaveLength(0);
    expect(world.createCalls).toHaveLength(0);
    expect(world.drafts).toHaveLength(0);
    expect(world.logs).toHaveLength(0);
  });

  it("si falla el borrador el gasto queda guardado y uploadUrl es null", async () => {
    const world = new MemoryWorld();
    world.failDraftCreate = true;
    const deps = makeDeps(world, { now: NOW });
    const result = await confirmVoiceExpense(deps, baseInput);
    expect(result.uploadUrl).toBeNull();
    expect(world.expenses).toHaveLength(1);
    expect(result.expenseId).toBe("e1");
  });
});

describe("receiveVoiceExpenseReceipt", () => {
  let world: MemoryWorld;
  let clock: { now: Date };
  let token: string;

  async function setup() {
    world = new MemoryWorld();
    clock = { now: NOW };
    const deps = makeDeps(world, clock);
    const confirmed = await confirmVoiceExpense(deps, baseInput);
    token = confirmed.uploadUrl!.split("/").pop()!;
    return deps;
  }
  const file = { bytes: PNG, name: "soporte.png" };

  it("token falso o con firma valida pero desconocido", async () => {
    const deps = await setup();
    const result = await receiveVoiceExpenseReceipt(deps, "inventado.firmafalsa", file);
    expect(result).toMatchObject({ ok: false, canRetry: false });
    const unknown = buildDraftToken(KEY)!.token;
    expect(await receiveVoiceExpenseReceipt(deps, unknown, file)).toMatchObject({ ok: false, canRetry: false });
    expect(world.attached).toHaveLength(0);
  });

  it("enlace vencido: se rechaza, se marca VENCIDO y avisa que el gasto ya esta guardado", async () => {
    const deps = await setup();
    clock.now = new Date(NOW.getTime() + DRAFT_TTL_MINUTES * 60_000 + 1000);
    const result = await receiveVoiceExpenseReceipt(deps, token, file);
    expect(result).toMatchObject({ ok: false, canRetry: false });
    if (!result.ok) expect(result.reason).toContain("ya quedó guardado");
    expect(world.drafts[0].status).toBe("VENCIDO");
    expect(world.attached).toHaveLength(0);
    expect(world.saved).toHaveLength(0);
  });

  it("la foto se pega al MISMO gasto y no se crea otro", async () => {
    const deps = await setup();
    const result = await receiveVoiceExpenseReceipt(deps, token, file);
    expect(result).toMatchObject({ ok: true, expenseId: "e1" });
    expect(world.expenses).toHaveLength(1);
    expect(world.createCalls).toHaveLength(1);
    expect(world.expenses[0]).toMatchObject({ receiptUrl: "/uploads/gastos/1.png", receiptName: "soporte.png" });
    expect(world.drafts[0].status).toBe("GUARDADO");
    expect(world.removed).toHaveLength(0);
  });

  it("archivo que no es imagen o PDF se rechaza sin guardarlo", async () => {
    const deps = await setup();
    const result = await receiveVoiceExpenseReceipt(deps, token, { bytes: new Uint8Array([1, 2, 3, 4, 5]), name: "x.exe" });
    expect(result).toMatchObject({ ok: false, canRetry: true });
    expect(world.saved).toHaveLength(0);
    expect(world.drafts[0].status).toBe("PENDIENTE");
  });

  it("archivo vacio", async () => {
    const deps = await setup();
    expect(await receiveVoiceExpenseReceipt(deps, token, { bytes: new Uint8Array([]), name: "x.png" })).toMatchObject({
      ok: false,
      canRetry: true,
    });
  });

  it("doble envio: el segundo dice que ya se uso y la foto sigue siendo la primera", async () => {
    const deps = await setup();
    expect((await receiveVoiceExpenseReceipt(deps, token, file)).ok).toBe(true);
    const second = await receiveVoiceExpenseReceipt(deps, token, file);
    expect(second).toMatchObject({ ok: false, canRetry: false });
    if (!second.ok) expect(second.reason).toContain("ya se usó");
    expect(world.expenses).toHaveLength(1);
    expect(world.expenses[0].receiptUrl).toBe("/uploads/gastos/1.png");
  });

  it("carrera: attachReceipt lanza ExpenseDraftUsedError y se borra el archivo guardado", async () => {
    const deps = await setup();
    world.draftsRepo.attachReceipt = async () => {
      throw new ExpenseDraftUsedError();
    };
    const result = await receiveVoiceExpenseReceipt(deps, token, file);
    expect(result).toMatchObject({ ok: false, canRetry: false });
    expect(world.removed).toEqual(world.saved);
    expect(world.saved).toHaveLength(1);
  });

  it("un error inesperado al pegar borra el archivo y se propaga", async () => {
    const deps = await setup();
    world.draftsRepo.attachReceipt = async () => {
      throw new Error("BD caida");
    };
    await expect(receiveVoiceExpenseReceipt(deps, token, file)).rejects.toThrow("BD caida");
    expect(world.removed).toEqual(world.saved);
  });

  it("sin gasto (savedOnConfirm y sin expenseId): el gasto ya no existe", async () => {
    const deps = await setup();
    world.drafts[0].expenseId = null;
    const result = await receiveVoiceExpenseReceipt(deps, token, file);
    expect(result).toMatchObject({ ok: false, canRetry: false });
    if (!result.ok) expect(result.reason).toContain("ya no existe");
    expect(world.saved).toHaveLength(0);
  });

  describe("enlace viejo (borrador sin gasto)", () => {
    async function legacy() {
      world = new MemoryWorld();
      clock = { now: NOW };
      const deps = makeDeps(world, clock);
      const generated = buildDraftToken(KEY)!;
      await world.draftsRepo.create({
        tokenHash: generated.hash,
        expenseId: "",
        categoryId: "cat-Marketing",
        accountId: "acc-banco",
        amount: 350_000,
        expenseDate: NOW,
        description: null,
        retroMotivo: null,
        employeeId: null,
        createdById: "u-alex",
        expiresAt: new Date(NOW.getTime() + 60_000),
      });
      world.drafts[0].expenseId = null;
      world.drafts[0].savedOnConfirm = false;
      return { deps, token: generated.token };
    }

    it("guarda su gasto con la foto al recibirla", async () => {
      const { deps, token: legacyToken } = await legacy();
      const result = await receiveVoiceExpenseReceipt(deps, legacyToken, file);
      expect(result.ok).toBe(true);
      expect(world.expenses).toHaveLength(1);
      expect(world.createCalls[0]).toMatchObject({ fromDraft: { id: "d1" }, receiptUrl: "/uploads/gastos/1.png" });
      expect(world.expenses[0].receiptUrl).toBe("/uploads/gastos/1.png");
      expect(world.drafts[0].status).toBe("GUARDADO");
      expect(world.logs).toHaveLength(1);
    });

    it("doble envio: el segundo no crea otro gasto", async () => {
      const { deps, token: legacyToken } = await legacy();
      await receiveVoiceExpenseReceipt(deps, legacyToken, file);
      const second = await receiveVoiceExpenseReceipt(deps, legacyToken, file);
      expect(second).toMatchObject({ ok: false, canRetry: false });
      expect(world.expenses).toHaveLength(1);
    });
  });
});
