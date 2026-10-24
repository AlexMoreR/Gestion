// Reglas puras del gasto dicho a Claude (MCP): vencimiento del enlace, estados y como se
// entienden las palabras del dueno (categorias y cuentas).

import type { ReceiptAccountType } from "./receipt-check";

export type ExpenseDraftStatus = "PENDIENTE" | "GUARDADO" | "RECHAZADO" | "VENCIDO";

// El enlace para subir la foto (opcional) dura 24 horas y sirve una sola vez.
export const DRAFT_TTL_MINUTES = 24 * 60;
// Marca en `revision` de los borradores nuevos: el gasto ya se guardo al confirmar y el enlace
// solo sirve para pegarle la foto. Sin ella (enlaces viejos) el gasto se guarda al recibir la foto.
export const DRAFT_SAVED_MARK = { modo: "gasto_guardado" } as const;
// Tope por gasto por este camino (la llave del MCP no debe poder crear gastos enormes).
export const VOICE_EXPENSE_MAX_AMOUNT = 20_000_000;

export class ExpenseDraftInputError extends Error {}

// El enlace ya se uso (doble envio): la foto ya quedo pegada o el gasto ya se guardo.
export class ExpenseDraftUsedError extends Error {
  constructor() {
    super("Este enlace ya se usó.");
  }
}

export function draftExpiresAt(now: Date): Date {
  return new Date(now.getTime() + DRAFT_TTL_MINUTES * 60_000);
}

export type DraftLike = { status: ExpenseDraftStatus; expiresAt: Date };

export type DraftAvailability =
  | { open: true }
  | { open: false; status: ExpenseDraftStatus; reason: string };

// ¿Se puede todavia subir una foto a este borrador?
export function draftAvailability(draft: DraftLike, now: Date): DraftAvailability {
  if (draft.status === "GUARDADO") {
    return { open: false, status: "GUARDADO", reason: "Este enlace ya se usó: la foto ya quedó guardada." };
  }
  if (draft.status === "RECHAZADO") {
    // Solo enlaces viejos que agotaron los intentos de la antigua revision.
    return { open: false, status: "RECHAZADO", reason: "Este enlace ya no sirve. El gasto no se guardó." };
  }
  if (draft.status === "VENCIDO" || draft.expiresAt.getTime() <= now.getTime()) {
    return {
      open: false,
      status: "VENCIDO",
      reason: "El enlace venció.",
    };
  }
  return { open: true };
}

// --- Categorias ---------------------------------------------------------------

export function normalizeWord(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Palabra del dueno -> nombre de la categoria en Gestion. "Publicidad" es Marketing y "otros" es Varios.
const CATEGORY_WORDS: Record<string, string> = {
  arriendo: "Arriendo",
  arrendamiento: "Arriendo",
  publicidad: "Marketing",
  marketing: "Marketing",
  nomina: "Nomina",
  servicios: "Servicios",
  servicio: "Servicios",
  herramientas: "Herramientas",
  herramienta: "Herramientas",
  otros: "Varios",
  otro: "Varios",
  varios: "Varios",
};

export const EXPENSE_CATEGORY_WORDS = ["arriendo", "publicidad", "nomina", "servicios", "herramientas", "otros"] as const;

export function resolveCategoryName(word: string): string | null {
  return CATEGORY_WORDS[normalizeWord(word)] ?? null;
}

export function isPayrollCategoryName(name: string): boolean {
  return /nomina/.test(normalizeWord(name));
}

// --- Cuentas ------------------------------------------------------------------

export const ACCOUNT_KIND_WORDS = ["efectivo", "banco", "billetera"] as const;

const ACCOUNT_TYPE_WORDS: Record<string, ReceiptAccountType> = {
  efectivo: "CASH",
  caja: "CASH",
  banco: "BANK",
  billetera: "WALLET",
  nequi: "WALLET",
  daviplata: "WALLET",
};

export type AccountOption = { id: string; name: string; type: ReceiptAccountType };

export type AccountResolution =
  | { ok: true; account: AccountOption }
  | { ok: false; error: string };

// "efectivo" / "banco" / "billetera" (o el nombre de una cuenta) -> la cuenta. Si hay dos del
// mismo tipo no adivina: devuelve las opciones para que Claude pregunte cual fue.
export function resolveAccount(word: string, accounts: AccountOption[]): AccountResolution {
  const query = normalizeWord(word);
  if (!query) {
    return { ok: false, error: "Falta la cuenta de donde salió el dinero (efectivo, banco o billetera)." };
  }
  const exact = accounts.filter((account) => normalizeWord(account.name) === query);
  if (exact.length === 1) {
    return { ok: true, account: exact[0] };
  }
  const type = ACCOUNT_TYPE_WORDS[query];
  const matches = type
    ? accounts.filter((account) => account.type === type)
    : accounts.filter((account) => normalizeWord(account.name).includes(query));
  if (matches.length === 1) {
    return { ok: true, account: matches[0] };
  }
  const list = (items: AccountOption[]) => items.map((account) => account.name).join(", ");
  if (matches.length > 1) {
    return {
      ok: false,
      error: `Hay varias cuentas posibles (${list(matches)}). Pregúntale al dueño cuál fue y vuelve a llamar con el nombre exacto de la cuenta.`,
    };
  }
  return {
    ok: false,
    error: `No hay una cuenta activa para "${word}". Cuentas disponibles: ${list(accounts) || "ninguna"}.`,
  };
}
