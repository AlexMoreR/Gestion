// Reglas puras del gasto dicho a Claude (MCP): vencimiento del enlace, estados y como se
// entienden las palabras del dueno (categorias y cuentas).

import type { ReceiptAccountType } from "./receipt-check";

export type ExpenseDraftStatus = "PENDIENTE" | "GUARDADO" | "RECHAZADO" | "VENCIDO";

// El enlace para subir la foto dura 30 minutos y sirve una sola vez.
export const DRAFT_TTL_MINUTES = 30;
// Fotos rechazadas permitidas antes de cerrar el borrador.
export const DRAFT_MAX_ATTEMPTS = 5;
// Tope por gasto por este camino (la llave del MCP no debe poder crear gastos enormes).
export const VOICE_EXPENSE_MAX_AMOUNT = 20_000_000;

export class ExpenseDraftInputError extends Error {}

// Un borrador se cerro de forma definitiva por una carrera (doble envio): ya se guardo el gasto.
export class ExpenseDraftUsedError extends Error {
  constructor() {
    super("Este enlace ya se usó.");
  }
}

export function draftExpiresAt(now: Date): Date {
  return new Date(now.getTime() + DRAFT_TTL_MINUTES * 60_000);
}

export type DraftLike = { status: ExpenseDraftStatus; expiresAt: Date; attempts: number };

export type DraftAvailability =
  | { open: true }
  | { open: false; status: ExpenseDraftStatus; reason: string };

// ¿Se puede todavia subir una foto a este borrador?
export function draftAvailability(draft: DraftLike, now: Date): DraftAvailability {
  if (draft.status === "GUARDADO") {
    return { open: false, status: "GUARDADO", reason: "Este enlace ya se usó: el gasto quedó guardado." };
  }
  if (draft.status === "RECHAZADO" || draft.attempts >= DRAFT_MAX_ATTEMPTS) {
    return {
      open: false,
      status: "RECHAZADO",
      reason: "Se agotaron los intentos con este enlace. Pídele a Claude que registre el gasto otra vez.",
    };
  }
  if (draft.status === "VENCIDO" || draft.expiresAt.getTime() <= now.getTime()) {
    return {
      open: false,
      status: "VENCIDO",
      reason: "El enlace venció. Pídele a Claude que registre el gasto otra vez.",
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
