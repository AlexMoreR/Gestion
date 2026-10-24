// Registrar un gasto hablandole a Claude (MCP): preparar (repetir el gasto), confirmar (guardar el
// gasto y crear el enlace para subir la foto) y recibir la foto (opcional: se pega al gasto, sin
// revisarla). Todo entra por puertos (`VoiceExpenseDeps`) para probarlo con un repositorio en memoria.

import { diaBogota, esRetroactivo, fechaPuestaParaGuardar, validarMotivo } from "../../retroactivos/domain/retroactivo";
import {
  ExpenseDraftInputError,
  ExpenseDraftUsedError,
  VOICE_EXPENSE_MAX_AMOUNT,
  draftAvailability,
  draftExpiresAt,
  isPayrollCategoryName,
  normalizeWord,
  resolveAccount,
  resolveCategoryName,
  type AccountOption,
} from "../domain/expense-draft";
import {
  RECEIPT_MAX_BYTES,
  RECEIPT_MIME_EXTENSION,
  formatCop,
  sniffReceiptMime,
} from "../domain/receipt-check";
import type {
  CreateExpenseInput,
  ExpenseDraftRepository,
  ExpenseDraftView,
  ExpensesRepository,
} from "../domain/repository";
import { buildDraftToken, hashDraftToken, verifyDraftToken } from "../../../lib/expense-draft-token";

export type VoiceExpenseActor = { id: string; name: string | null; email: string | null };

export type VoiceExpenseDeps = {
  expenses: Pick<ExpensesRepository, "ensureCategoryByName" | "createExpense">;
  drafts: ExpenseDraftRepository;
  listAccounts(): Promise<AccountOption[]>;
  // Personas (usuarios ADMIN/EMPLEADO) cuyo nombre contiene el texto.
  findEmployees(query: string): Promise<Array<{ id: string; name: string }>>;
  resolveActor(): Promise<VoiceExpenseActor | null>;
  receiptStore: {
    save(file: { bytes: Uint8Array; name: string; ext: string }): Promise<{ url: string; name: string }>;
    remove(url: string): Promise<void>;
  };
  siteUrl(path: string): string;
  logActivity(actor: VoiceExpenseActor, entry: { expenseId: string; summary: string }): Promise<void>;
  now?: () => Date;
  // Para pruebas; en produccion se arma con AUTH_SECRET.
  newToken?: () => { token: string; hash: string } | null;
  tokenKey?: string;
};

export type VoiceExpenseInput = {
  amount: number;
  category: string;
  account: string;
  date?: string;
  note?: string;
  retroReason?: string;
  person?: string;
};

export type PreparedVoiceExpense = {
  amount: number;
  categoryName: string;
  account: AccountOption;
  day: string;
  note: string | null;
  retroReason: string | null;
  employee: { id: string; name: string } | null;
};

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const NOTE_MAX = 500;

function nowOf(deps: VoiceExpenseDeps): Date {
  return deps.now ? deps.now() : new Date();
}

function isRealDay(value: string): boolean {
  return DAY_RE.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

// Valida lo que dijo el dueno y lo traduce a categoria, cuenta, fecha y persona. No escribe nada.
export async function prepareVoiceExpense(deps: VoiceExpenseDeps, input: VoiceExpenseInput): Promise<PreparedVoiceExpense> {
  const amount = Math.round(input.amount * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ExpenseDraftInputError("El monto debe ser mayor a cero.");
  }
  if (amount > VOICE_EXPENSE_MAX_AMOUNT) {
    throw new ExpenseDraftInputError(
      `Por este camino el tope es ${formatCop(VOICE_EXPENSE_MAX_AMOUNT)} por gasto. Para un valor mayor usa la pantalla de Gastos.`,
    );
  }

  const categoryName = resolveCategoryName(input.category);
  if (!categoryName) {
    throw new ExpenseDraftInputError(
      `Categoría "${input.category}" no válida. Usa: arriendo, publicidad, nómina, servicios, herramientas u otros.`,
    );
  }

  const now = nowOf(deps);
  const today = diaBogota(now);
  const day = input.date?.trim() || today;
  if (!isRealDay(day)) {
    throw new ExpenseDraftInputError("La fecha debe ser un día real en formato AAAA-MM-DD.");
  }
  if (day > today) {
    throw new ExpenseDraftInputError("La fecha del gasto no puede ser futura.");
  }

  let retroReason: string | null = null;
  if (esRetroactivo(day, now)) {
    const motivo = validarMotivo(input.retroReason);
    if (!motivo.ok) {
      throw new ExpenseDraftInputError(motivo.error);
    }
    retroReason = motivo.motivo;
  }

  const note = input.note?.trim().replace(/\s+/g, " ") || null;
  if (note && note.length > NOTE_MAX) {
    throw new ExpenseDraftInputError(`La nota es muy larga (máximo ${NOTE_MAX} caracteres).`);
  }

  const resolvedAccount = resolveAccount(input.account, await deps.listAccounts());
  if (!resolvedAccount.ok) {
    throw new ExpenseDraftInputError(resolvedAccount.error);
  }

  let employee: { id: string; name: string } | null = null;
  if (isPayrollCategoryName(categoryName)) {
    const query = normalizeWord(input.person ?? "");
    if (!query) {
      throw new ExpenseDraftInputError("Un gasto de nómina necesita decir a qué persona corresponde (parámetro persona).");
    }
    const matches = await deps.findEmployees(query);
    if (matches.length === 0) {
      throw new ExpenseDraftInputError(`No hay un usuario con el nombre "${input.person}".`);
    }
    if (matches.length > 1) {
      throw new ExpenseDraftInputError(
        `Hay varias personas con ese nombre: ${matches.map((person) => person.name).join(", ")}. Sé más específico.`,
      );
    }
    employee = matches[0];
  }

  return { amount, categoryName, account: resolvedAccount.account, day, note, retroReason, employee };
}

export function describeVoiceExpense(prepared: PreparedVoiceExpense): string {
  return [
    prepared.categoryName,
    formatCop(prepared.amount),
    prepared.account.name,
    prepared.day,
    prepared.employee ? `Persona: ${prepared.employee.name}` : null,
    prepared.note ? `Nota: ${prepared.note}` : null,
    prepared.retroReason ? `Motivo de la fecha anterior: ${prepared.retroReason}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export type ConfirmedVoiceExpense = {
  expenseId: string;
  // null si el gasto quedo guardado pero no se pudo crear el enlace de la foto.
  uploadUrl: string | null;
  expiresAt: Date;
  summary: string;
};

// El dueno dijo "si": guarda el gasto de una vez (sin foto) y crea el enlace opcional (24 h, un
// solo uso) para subirla despues. La foto no se revisa.
export async function confirmVoiceExpense(deps: VoiceExpenseDeps, input: VoiceExpenseInput): Promise<ConfirmedVoiceExpense> {
  const prepared = await prepareVoiceExpense(deps, input);
  const actor = await deps.resolveActor();
  if (!actor) {
    throw new ExpenseDraftInputError("No hay un usuario administrador al cual asignar el gasto.");
  }
  const generated = deps.newToken ? deps.newToken() : buildDraftToken(deps.tokenKey);
  if (!generated) {
    throw new ExpenseDraftInputError("El servidor no tiene configurado AUTH_SECRET: no se puede crear el enlace.");
  }

  const category = await deps.expenses.ensureCategoryByName(prepared.categoryName, actor.id);
  const now = nowOf(deps);
  const expiresAt = draftExpiresAt(now);
  const expenseDate = fechaPuestaParaGuardar(prepared.day);
  const expense = await deps.expenses.createExpense({
    categoryId: category.id,
    accountId: prepared.account.id,
    amount: prepared.amount,
    description: prepared.note,
    employeeId: prepared.employee?.id ?? null,
    expenseDate,
    createdById: actor.id,
    retroactivo: prepared.retroReason
      ? { fechaPuesta: prepared.day, usuarioId: actor.id, motivo: prepared.retroReason }
      : null,
  });
  // El gasto ya existe: lo que falle de aqui en adelante no debe perderlo ni hacer que se repita.
  await deps.logActivity(actor, {
    expenseId: expense.id,
    summary: `Registró un gasto de ${formatCop(prepared.amount)} (por Claude)`,
  }).catch((error) => console.error("[gastos-voz] No se pudo anotar en la bitácora:", error));

  let uploadUrl: string | null = null;
  try {
    await deps.drafts.create({
      tokenHash: generated.hash,
      expenseId: expense.id,
      categoryId: category.id,
      accountId: prepared.account.id,
      amount: prepared.amount,
      expenseDate,
      description: prepared.note,
      retroMotivo: prepared.retroReason,
      employeeId: prepared.employee?.id ?? null,
      createdById: actor.id,
      expiresAt,
    });
    uploadUrl = deps.siteUrl(`/gastos/soporte/${generated.token}`);
  } catch (error) {
    console.error("[gastos-voz] El gasto quedó guardado pero no se pudo crear el enlace de la foto:", error);
  }
  return { expenseId: expense.id, uploadUrl, expiresAt, summary: describeVoiceExpense(prepared) };
}

// --- Pagina publica de la foto ---------------------------------------------------

export type DraftLookup = { ok: true; draft: ExpenseDraftView } | { ok: false; reason: string };

const INVALID_LINK = "Este enlace no es válido.";

// Busca el borrador por el token del enlace y comprueba que se pueda usar.
export async function lookupOpenDraft(deps: VoiceExpenseDeps, rawToken: string): Promise<DraftLookup> {
  const token = verifyDraftToken(rawToken, deps.tokenKey);
  if (!token) {
    return { ok: false, reason: INVALID_LINK };
  }
  const draft = await deps.drafts.findByTokenHash(hashDraftToken(token));
  if (!draft) {
    return { ok: false, reason: INVALID_LINK };
  }
  const availability = draftAvailability({ status: draft.status, expiresAt: draft.expiresAt }, nowOf(deps));
  if (!availability.open) {
    if (availability.status === "VENCIDO" && draft.status === "PENDIENTE") {
      await deps.drafts.markExpired(draft.id);
    }
    // En los gastos nuevos el gasto ya esta guardado aunque el enlace venza.
    const saved = draft.savedOnConfirm && availability.status === "VENCIDO";
    return {
      ok: false,
      reason: saved
        ? `${availability.reason} El gasto ya quedó guardado; la foto se puede agregar desde la pantalla de Gastos.`
        : availability.reason,
    };
  }
  // Gasto nuevo cuyo gasto se borro despues (expenseId queda en NULL): no hay a donde pegar la foto.
  if (draft.savedOnConfirm && !draft.expenseId) {
    return { ok: false, reason: "El gasto de este enlace ya no existe." };
  }
  return { ok: true, draft };
}

export type ReceiptSubmission =
  | { ok: true; expenseId: string; summary: string }
  | { ok: false; reason: string; canRetry: boolean };

// Recibe la foto (sin revisarla). Gasto nuevo: se pega al gasto ya guardado. Enlace viejo (el gasto
// aun no existe): se guarda el gasto con la foto.
export async function receiveVoiceExpenseReceipt(
  deps: VoiceExpenseDeps,
  rawToken: string,
  file: { bytes: Uint8Array; name: string },
): Promise<ReceiptSubmission> {
  const lookup = await lookupOpenDraft(deps, rawToken);
  if (!lookup.ok) {
    return { ok: false, reason: lookup.reason, canRetry: false };
  }
  const { draft } = lookup;

  if (file.bytes.length === 0) {
    return { ok: false, reason: "Elige o toma una foto primero.", canRetry: true };
  }
  if (file.bytes.length > RECEIPT_MAX_BYTES) {
    return { ok: false, reason: "La foto supera el límite de 12 MB.", canRetry: true };
  }
  const mime = sniffReceiptMime(file.bytes);
  if (!mime) {
    return { ok: false, reason: "El archivo no es compatible. Solo JPG, PNG, WEBP o PDF.", canRetry: true };
  }
  if (draft.savedOnConfirm && !draft.expenseId) {
    return { ok: false, reason: "El gasto de este enlace ya no existe.", canRetry: false };
  }

  const stored = await deps.receiptStore.save({
    bytes: file.bytes,
    name: file.name,
    ext: RECEIPT_MIME_EXTENSION[mime],
  });
  const summary = `${draft.categoryName} · ${formatCop(draft.amount)} · ${draft.accountName}`;

  if (draft.expenseId) {
    try {
      await deps.drafts.attachReceipt(draft.id, { expenseId: draft.expenseId, url: stored.url, name: stored.name });
      return { ok: true, expenseId: draft.expenseId, summary };
    } catch (error) {
      await deps.receiptStore.remove(stored.url).catch(() => undefined);
      if (error instanceof ExpenseDraftUsedError) {
        return { ok: false, reason: error.message, canRetry: false };
      }
      throw error;
    }
  }

  const expenseInput: CreateExpenseInput = {
    categoryId: draft.categoryId,
    accountId: draft.accountId,
    amount: draft.amount,
    description: draft.description,
    receiptUrl: stored.url,
    receiptName: stored.name,
    employeeId: draft.employeeId,
    expenseDate: draft.expenseDate,
    createdById: draft.createdById,
    retroactivo: draft.retroMotivo
      ? { fechaPuesta: diaBogota(draft.expenseDate), usuarioId: draft.createdById, motivo: draft.retroMotivo }
      : null,
    fromDraft: { id: draft.id },
  };
  try {
    const expense = await deps.expenses.createExpense(expenseInput);
    await deps.logActivity(
      { id: draft.createdById, name: draft.createdByName, email: null },
      { expenseId: expense.id, summary: `Registró un gasto de ${formatCop(draft.amount)} (por Claude)` },
    );
    return { ok: true, expenseId: expense.id, summary };
  } catch (error) {
    await deps.receiptStore.remove(stored.url).catch(() => undefined);
    if (error instanceof ExpenseDraftUsedError) {
      return { ok: false, reason: error.message, canRetry: false };
    }
    throw error;
  }
}
