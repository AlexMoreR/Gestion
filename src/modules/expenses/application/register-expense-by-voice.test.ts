import { beforeEach, describe, expect, it } from "vitest";
import {
  confirmVoiceExpense,
  prepareVoiceExpense,
  receiveVoiceExpenseReceipt,
  type ReceiptValidator,
  type VoiceExpenseDeps,
} from "./register-expense-by-voice";
import {
  DRAFT_MAX_ATTEMPTS,
  ExpenseDraftInputError,
  ExpenseDraftUsedError,
  type AccountOption,
  type ExpenseDraftStatus,
} from "../domain/expense-draft";
import type { ReceiptReview } from "../domain/receipt-check";
import type {
  CreateExpenseInput,
  ExpenseDraftRepository,
  ExpenseDraftView,
  NewExpenseDraft,
} from "../domain/repository";
import type { Expense, ExpenseCategory } from "../domain/entities";

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
  forceUsedError = false;
  rejections: Array<{ draftId: string; reason: string }> = [];
  private seq = 0;

  draftsRepo: ExpenseDraftRepository = {
    create: async (input: NewExpenseDraft) => {
      this.seq += 1;
      const account = ACCOUNTS.find((item) => item.id === input.accountId)!;
      this.drafts.push({
        id: `d${this.seq}`,
        tokenHash: input.tokenHash,
        status: "PENDIENTE",
        attempts: 0,
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
    recordRejection: async (draftId, rejection) => {
      const draft = this.drafts.find((item) => item.id === draftId)!;
      draft.attempts += 1;
      if (draft.attempts >= rejection.maxAttempts) draft.status = "RECHAZADO";
      this.rejections.push({ draftId, reason: rejection.reason });
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
      if (this.forceUsedError) throw new ExpenseDraftUsedError();
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

function makeValidator(overrides: Partial<ReceiptValidator> = {}): ReceiptValidator & { calls: number } {
  const validator = {
    calls: 0,
    review: undefined as unknown as ReceiptValidator["review"],
    isConfigured: () => true,
    ...overrides,
  };
  if (!overrides.review) {
    validator.review = async () => ({ kind: "TRANSFERENCIA", readAmount: 350_000 }) satisfies ReceiptReview;
  }
  const inner = validator.review;
  validator.review = async (input) => {
    validator.calls += 1;
    return inner(input);
  };
  return validator;
}

function makeDeps(world: MemoryWorld, validator: ReceiptValidator, clock: { now: Date }): VoiceExpenseDeps {
  return {
    expenses: world.expensesRepo,
    drafts: world.draftsRepo,
    listAccounts: async () => ACCOUNTS,
    findEmployees: async (query) => (query.includes("ingrid") ? [{ id: "u-ingrid", name: "Ingrid" }] : []),
    resolveActor: async () => ({ id: "u-alex", name: "Alex", email: null }),
    validator,
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
    deps = makeDeps(world, makeValidator(), { now: NOW });
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
    const ambiguous = makeDeps(world, makeValidator(), { now: NOW });
    ambiguous.listAccounts = async () => [...ACCOUNTS, { id: "acc-b2", name: "Davivienda", type: "BANK" }];
    await expect(prepareVoiceExpense(ambiguous, baseInput)).rejects.toThrow(/Davivienda/);
  });
});

describe("confirmVoiceExpense", () => {
  it("sin llave del validador rechaza y no crea borrador", async () => {
    const world = new MemoryWorld();
    const deps = makeDeps(world, makeValidator({ isConfigured: () => false }), { now: NOW });
    await expect(confirmVoiceExpense(deps, baseInput)).rejects.toThrow(ExpenseDraftInputError);
    expect(world.drafts).toHaveLength(0);
  });

  it("crea el borrador y devuelve el enlace con el token", async () => {
    const world = new MemoryWorld();
    const deps = makeDeps(world, makeValidator(), { now: NOW });
    const result = await confirmVoiceExpense(deps, baseInput);
    expect(result.uploadUrl).toMatch(/^https:\/\/gestion\.test\/gastos\/soporte\/[\w-]+\.[\w-]{22}$/);
    expect(result.expiresAt.getTime()).toBe(NOW.getTime() + 30 * 60_000);
    expect(world.drafts).toHaveLength(1);
    expect(world.drafts[0]).toMatchObject({ status: "PENDIENTE", amount: 350_000, accountId: "acc-banco" });
    // En la BD solo queda el hash, nunca el token.
    expect(result.uploadUrl).not.toContain(world.drafts[0].tokenHash);
  });
});

describe("receiveVoiceExpenseReceipt", () => {
  let world: MemoryWorld;
  let clock: { now: Date };
  let token: string;

  async function setup(validator: ReceiptValidator) {
    world = new MemoryWorld();
    clock = { now: NOW };
    const deps = makeDeps(world, validator, clock);
    const confirmed = await confirmVoiceExpense(deps, baseInput);
    token = confirmed.uploadUrl.split("/").pop()!;
    return deps;
  }
  const file = { bytes: PNG, name: "soporte.png" };

  it("token falso", async () => {
    const deps = await setup(makeValidator());
    const result = await receiveVoiceExpenseReceipt(deps, "inventado.firmafalsa", file);
    expect(result).toMatchObject({ ok: false, canRetry: false });
    // Con firma valida pero que no existe en la BD
    const { buildDraftToken } = await import("../../../lib/expense-draft-token");
    const unknown = buildDraftToken(KEY)!.token;
    expect(await receiveVoiceExpenseReceipt(deps, unknown, file)).toMatchObject({ ok: false, canRetry: false });
    expect(world.expenses).toHaveLength(0);
  });

  it("borrador vencido: no guarda y lo marca VENCIDO", async () => {
    const deps = await setup(makeValidator());
    clock.now = new Date(NOW.getTime() + 31 * 60_000);
    const result = await receiveVoiceExpenseReceipt(deps, token, file);
    expect(result).toMatchObject({ ok: false, canRetry: false });
    expect(world.drafts[0].status).toBe("VENCIDO");
    expect(world.expenses).toHaveLength(0);
  });

  it("foto valida con el monto correcto: guarda 1 gasto y el borrador queda GUARDADO", async () => {
    const validator = makeValidator();
    const deps = await setup(validator);
    const result = await receiveVoiceExpenseReceipt(deps, token, file);
    expect(result.ok).toBe(true);
    expect(world.expenses).toHaveLength(1);
    expect(world.expenses[0]).toMatchObject({ amount: 350_000, receiptUrl: "/uploads/gastos/1.png" });
    expect(world.drafts[0].status).toBe("GUARDADO");
    expect(world.logs).toHaveLength(1);
    expect(world.removed).toHaveLength(0);
  });

  it("foto OTRO: no guarda y suma un intento", async () => {
    const deps = await setup(makeValidator({ review: async () => ({ kind: "OTRO", readAmount: null }) }));
    const result = await receiveVoiceExpenseReceipt(deps, token, file);
    expect(result).toMatchObject({ ok: false, canRetry: true });
    expect(world.expenses).toHaveLength(0);
    expect(world.drafts[0].attempts).toBe(1);
    expect(world.saved).toHaveLength(0);
  });

  it("monto distinto: no guarda y explica el motivo", async () => {
    const deps = await setup(makeValidator({ review: async () => ({ kind: "TRANSFERENCIA", readAmount: 305_000 }) }));
    const result = await receiveVoiceExpenseReceipt(deps, token, file);
    expect(result).toMatchObject({ ok: false, canRetry: true });
    if (!result.ok) expect(result.reason).toContain("La foto dice $305.000 y el gasto es de $350.000");
    expect(world.expenses).toHaveLength(0);
    expect(world.rejections[0].reason).toContain("$305.000");
  });

  it("5 intentos fallidos dejan el borrador RECHAZADO", async () => {
    const deps = await setup(makeValidator({ review: async () => ({ kind: "OTRO", readAmount: null }) }));
    for (let i = 1; i <= DRAFT_MAX_ATTEMPTS; i += 1) {
      const result = await receiveVoiceExpenseReceipt(deps, token, file);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.canRetry).toBe(i < DRAFT_MAX_ATTEMPTS);
    }
    expect(world.drafts[0].status).toBe<ExpenseDraftStatus>("RECHAZADO");
    // Un sexto intento ya no llega ni al validador.
    const again = await receiveVoiceExpenseReceipt(deps, token, file);
    expect(again).toMatchObject({ ok: false, canRetry: false });
    expect(world.expenses).toHaveLength(0);
  });

  it("si el validador lanza error: no guarda y cuenta el intento", async () => {
    const deps = await setup(
      makeValidator({
        review: async () => {
          throw new Error("API caida");
        },
      }),
    );
    const result = await receiveVoiceExpenseReceipt(deps, token, file);
    expect(result).toMatchObject({ ok: false, canRetry: true });
    expect(world.drafts[0].attempts).toBe(1);
    expect(world.drafts[0].status).toBe("PENDIENTE");
    expect(world.expenses).toHaveLength(0);
  });

  it("archivo que no es imagen o PDF: no llega al validador", async () => {
    const validator = makeValidator();
    const deps = await setup(validator);
    const result = await receiveVoiceExpenseReceipt(deps, token, { bytes: new Uint8Array([1, 2, 3, 4, 5]), name: "x.exe" });
    expect(result).toMatchObject({ ok: false, canRetry: true });
    expect(validator.calls).toBe(0);
    expect(world.drafts[0].attempts).toBe(0);
  });

  it("archivo vacio", async () => {
    const deps = await setup(makeValidator());
    expect(await receiveVoiceExpenseReceipt(deps, token, { bytes: new Uint8Array([]), name: "x.png" })).toMatchObject({
      ok: false,
      canRetry: true,
    });
  });

  it("doble envio: el segundo dice que ya se uso y hay un solo gasto", async () => {
    const deps = await setup(makeValidator());
    expect((await receiveVoiceExpenseReceipt(deps, token, file)).ok).toBe(true);
    const second = await receiveVoiceExpenseReceipt(deps, token, file);
    expect(second).toMatchObject({ ok: false, canRetry: false });
    if (!second.ok) expect(second.reason).toContain("ya se usó");
    expect(world.expenses).toHaveLength(1);
  });

  it("carrera: createExpense lanza ExpenseDraftUsedError y se borra el archivo guardado", async () => {
    const deps = await setup(makeValidator());
    world.forceUsedError = true;
    const result = await receiveVoiceExpenseReceipt(deps, token, file);
    expect(result).toMatchObject({ ok: false, canRetry: false });
    expect(world.saved).toHaveLength(1);
    expect(world.removed).toEqual(world.saved);
    expect(world.expenses).toHaveLength(0);
  });

  it("un error inesperado al crear tambien borra el archivo y se propaga", async () => {
    const deps = await setup(makeValidator());
    world.expensesRepo.createExpense = async () => {
      throw new Error("BD caida");
    };
    await expect(receiveVoiceExpenseReceipt(deps, token, file)).rejects.toThrow("BD caida");
    expect(world.removed).toEqual(world.saved);
  });
});
