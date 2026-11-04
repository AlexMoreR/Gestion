// Registrar el pago a la proveedora de una orden de fabricacion (OF) hablandole a Claude (MCP), en
// dos pasos como registrar_gasto: preparar (repetir el resumen, no guarda) y confirmar (guarda UN
// abono PAYMENT en la cuenta de la proveedora). Nunca crea un gasto: el pago a la proveedora ya es
// costo de la venta, y como gasto se contaria dos veces. Todo entra por puertos para probarlo en memoria.

import { diaBogota, fechaPuestaParaGuardar } from "../../retroactivos/domain/retroactivo";
import { resolveAccount, type AccountOption } from "../../expenses/domain/expense-draft";
import { RECEIPT_MAX_BYTES, RECEIPT_MIME_EXTENSION, formatCop, sniffReceiptMime } from "../../expenses/domain/receipt-check";
import { buildDraftToken, hashDraftToken, verifyDraftToken } from "../../../lib/expense-draft-token";
import { storedCodeCandidates } from "../../../lib/code-display";
import {
  isLikelyDuplicate,
  validateSupplierPayment,
  type OfBalance,
  type RecentSupplierPayment,
} from "../domain/supplier-payment";

export class SupplierPaymentInputError extends Error {}

export type SupplierPaymentActor = { id: string; name: string | null; email: string | null };

export type OfInfo = {
  id: string;
  code: string;
  orderId: string;
  orderStatus: string;
  saleId: string | null;
  saleCode: string | null;
  // ANTICIPO_50_50 | PAGO_TOTAL | CONTRAENTREGA | null (sin definir)
  paymentMethod: string | null;
  supplier: { id: string; name: string };
};

export type NewSupplierPayment = {
  supplierId: string;
  orderId: string;
  saleId: string | null;
  accountId: string;
  amount: number;
  paymentDate: Date;
  note: string | null;
  createdById: string;
  // Enlace para la foto del comprobante: se guarda en la misma transaccion del pago.
  receiptDraft: { tokenHash: string; expiraEn: Date };
};

// Lo que muestra la pagina publica del enlace de la foto.
export type PaymentDraftView = {
  id: string;
  ledgerEntryId: string;
  expiraEn: Date;
  usadoEn: Date | null;
  ofCode: string | null;
  supplierName: string;
  amount: number;
  paymentDate: Date | null;
};

export type SupplierPaymentDeps = {
  findOfByCode(code: string): Promise<OfInfo | null>;
  listAccounts(): Promise<AccountOption[]>;
  getBalance(of: OfInfo): Promise<OfBalance>;
  // Abonos PAYMENT recientes de la misma orden + proveedora (para no registrar dos veces).
  recentPayments(of: OfInfo): Promise<RecentSupplierPayment[]>;
  // Guarda el abono; debe volver a revisar el duplicado dentro de su transaccion y lanzar
  // SupplierPaymentDuplicateError si ya existe.
  createPayment(of: OfInfo, input: NewSupplierPayment, nuevo: RecentSupplierPayment): Promise<{ id: string }>;
  // Si ya no falta nada (costo confirmado), marca PAID los productos de la proveedora en la orden.
  markItemsPaidIfSettled(of: OfInfo): Promise<OfBalance>;
  resolveActor(): Promise<SupplierPaymentActor | null>;
  logActivity(actor: SupplierPaymentActor, entry: { entryId: string; summary: string }): Promise<void>;
  siteUrl(path: string): string;
  findDraftByTokenHash(hash: string): Promise<PaymentDraftView | null>;
  // Pega la foto al pago con candado sobre el borrador; lanza SupplierPaymentDraftUsedError si ya se uso o vencio.
  attachReceipt(draftId: string, receipt: { ledgerEntryId: string; url: string; name: string }): Promise<void>;
  receiptStore: {
    // ext sale del tipo real del archivo (sus bytes), nunca del nombre que manda el navegador.
    save(file: { bytes: Uint8Array; name: string; ext: ".jpg" | ".png" | ".webp" | ".pdf" }): Promise<{ url: string; name: string }>;
    remove(url: string): Promise<void>;
  };
  now?: () => Date;
  // Para pruebas; en produccion se arma con AUTH_SECRET.
  newToken?: () => { token: string; hash: string } | null;
  tokenKey?: string;
};

export const PAYMENT_DRAFT_TTL_MS = 24 * 60 * 60_000;

export class SupplierPaymentDraftUsedError extends Error {
  constructor() {
    super("Este enlace ya se usó o venció: la foto no se pegó otra vez.");
  }
}

export class SupplierPaymentDuplicateError extends SupplierPaymentInputError {
  constructor() {
    super("Ya se registró un pago igual (misma OF, mismo monto y mismo día) hace pocos minutos. No se guardó otro.");
  }
}

export type SupplierPaymentInput = {
  of: string;
  monto: number;
  cuenta: string;
  fecha?: string;
  nota?: string;
  motivoFechaAnterior?: string;
  motivoSobrepago?: string;
};

export type PreparedSupplierPayment = {
  of: OfInfo;
  account: AccountOption;
  monto: number;
  day: string;
  balance: OfBalance;
  note: string | null;
  avisos: string[];
  duplicado: boolean;
};

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const NOTE_MAX = 500;
const OF_RE = /^OF-\d+$/;

function isRealDay(value: string): boolean {
  return DAY_RE.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

function buildNote(input: SupplierPaymentInput): string | null {
  const parts = [
    input.nota?.trim(),
    input.motivoFechaAnterior?.trim() ? `Motivo fecha anterior: ${input.motivoFechaAnterior.trim()}` : null,
    input.motivoSobrepago?.trim() ? `Motivo sobrepago: ${input.motivoSobrepago.trim()}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ").replace(/\s+/g, " ") : null;
}

// Valida lo que dijo el dueno y arma el resumen. No escribe nada.
export async function prepareSupplierPayment(
  deps: SupplierPaymentDeps,
  input: SupplierPaymentInput,
): Promise<PreparedSupplierPayment> {
  const now = deps.now ? deps.now() : new Date();
  // El MCP muestra "OF-35"; en la base esta "OF-00035". Se aceptan las dos formas.
  const code = storedCodeCandidates(input.of.trim().toUpperCase())[0];
  if (!OF_RE.test(code)) {
    throw new SupplierPaymentInputError(`"${input.of}" no es un código de orden de fabricación (ej. OF-35).`);
  }
  const of = await deps.findOfByCode(code);
  if (!of) {
    throw new SupplierPaymentInputError(`No existe la orden de fabricación ${code}.`);
  }

  const monto = Math.round(input.monto * 100) / 100;
  const hoy = diaBogota(now);
  const day = input.fecha?.trim() || hoy;
  if (!isRealDay(day)) {
    throw new SupplierPaymentInputError("La fecha debe ser un día real en formato AAAA-MM-DD.");
  }
  if (day > hoy) {
    throw new SupplierPaymentInputError("La fecha del pago no puede ser futura.");
  }

  const note = buildNote(input);
  if (note && note.length > NOTE_MAX) {
    throw new SupplierPaymentInputError(`La nota es muy larga (máximo ${NOTE_MAX} caracteres).`);
  }

  const resolved = resolveAccount(input.cuenta, await deps.listAccounts());
  if (!resolved.ok) {
    throw new SupplierPaymentInputError(resolved.error);
  }

  const balance = await deps.getBalance(of);
  const issues = validateSupplierPayment({
    monto,
    falta: balance.falta,
    fecha: day,
    hoy,
    motivoFechaAnterior: input.motivoFechaAnterior,
    motivoSobrepago: input.motivoSobrepago,
  });
  const errores = issues.filter((issue) => issue.tipo === "error");
  if (errores.length > 0) {
    throw new SupplierPaymentInputError(errores.map((issue) => issue.mensaje).join(" "));
  }

  const avisos = issues.filter((issue) => issue.tipo === "aviso").map((issue) => issue.mensaje);
  // Regla del negocio (solo avisa, no bloquea): en contraentrega se le paga cuando el producto llega al cliente.
  if (of.paymentMethod === "CONTRAENTREGA" && of.orderStatus !== "COMPLETED") {
    avisos.push("Venta contraentrega: a la proveedora se le paga cuando el producto le llega al cliente, y esta orden aún no está entregada.");
  }
  const duplicado = isLikelyDuplicate(
    { ofId: of.id, monto, fecha: fechaPuestaParaGuardar(day), creadoEn: now },
    await deps.recentPayments(of),
  );
  if (duplicado) {
    avisos.push("Posible duplicado: hace pocos minutos se registró un pago igual a esta OF. Si se confirma, se rechaza.");
  }

  return { of, account: resolved.account, monto, day, balance, note, avisos, duplicado };
}

export function describeSupplierPayment(prepared: PreparedSupplierPayment): string {
  const { of, balance } = prepared;
  return [
    `${of.code} · ${of.supplier.name}`,
    of.saleCode ? `Venta ${of.saleCode}` : "Sin venta ligada",
    `Pago ${formatCop(prepared.monto)} desde ${prepared.account.name} el ${prepared.day}`,
    balance.costoConfirmado
      ? `Costo ${formatCop(balance.costo ?? 0)} · pagado ${formatCop(balance.pagado)} · falta ${formatCop(balance.falta ?? 0)}`
      : `Costo sin confirmar · pagado ${formatCop(balance.pagado)}`,
    prepared.note ? `Nota: ${prepared.note}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export type ConfirmedSupplierPayment = {
  paymentId: string;
  balance: OfBalance;
  summary: string;
  uploadUrl: string;
  expiresAt: Date;
};

// El dueno dijo "si": vuelve a validar y guarda UN abono a la proveedora.
export async function confirmSupplierPayment(
  deps: SupplierPaymentDeps,
  input: SupplierPaymentInput,
): Promise<ConfirmedSupplierPayment> {
  const prepared = await prepareSupplierPayment(deps, input);
  if (prepared.duplicado) {
    throw new SupplierPaymentDuplicateError();
  }
  const actor = await deps.resolveActor();
  if (!actor) {
    throw new SupplierPaymentInputError("No hay un usuario administrador al cual asignar el pago.");
  }
  const generated = deps.newToken ? deps.newToken() : buildDraftToken(deps.tokenKey);
  if (!generated) {
    throw new SupplierPaymentInputError("El servidor no tiene configurado AUTH_SECRET: no se puede crear el enlace de la foto.");
  }
  const now = deps.now ? deps.now() : new Date();
  const expiresAt = new Date(now.getTime() + PAYMENT_DRAFT_TTL_MS);
  const paymentDate = fechaPuestaParaGuardar(prepared.day);
  const { of } = prepared;
  const created = await deps.createPayment(
    of,
    {
      supplierId: of.supplier.id,
      orderId: of.orderId,
      saleId: of.saleId,
      accountId: prepared.account.id,
      amount: prepared.monto,
      paymentDate,
      note: prepared.note,
      createdById: actor.id,
      receiptDraft: { tokenHash: generated.hash, expiraEn: expiresAt },
    },
    { ofId: of.id, monto: prepared.monto, fecha: paymentDate, creadoEn: now },
  );
  // El pago ya existe: lo que falle de aqui en adelante no debe hacer que se repita.
  let balance: OfBalance;
  try {
    balance = await deps.markItemsPaidIfSettled(of);
  } catch (error) {
    console.error("[pago-proveedora-voz] El pago quedó guardado pero no se pudo revisar el saldo:", error);
    balance = await deps.getBalance(of).catch(() => prepared.balance);
  }
  await deps
    .logActivity(actor, {
      entryId: created.id,
      summary: `Registró un pago de ${formatCop(prepared.monto)} a ${of.supplier.name} por ${of.code} (por Claude)`,
    })
    .catch((error) => console.error("[pago-proveedora-voz] No se pudo anotar en la bitácora:", error));

  return {
    paymentId: created.id,
    balance,
    summary: describeSupplierPayment(prepared),
    uploadUrl: deps.siteUrl(`/proveedores-pago/soporte/${generated.token}`),
    expiresAt,
  };
}

// --- Pagina publica de la foto del comprobante -------------------------------------------

export type PaymentDraftLookup = { ok: true; draft: PaymentDraftView } | { ok: false; reason: string };

const INVALID_LINK = "Este enlace no es válido.";

export async function lookupPaymentDraft(deps: SupplierPaymentDeps, rawToken: string): Promise<PaymentDraftLookup> {
  const token = verifyDraftToken(rawToken, deps.tokenKey);
  const draft = token ? await deps.findDraftByTokenHash(hashDraftToken(token)) : null;
  if (!draft) {
    return { ok: false, reason: INVALID_LINK };
  }
  if (draft.usadoEn) {
    return { ok: false, reason: "Este enlace ya se usó: la foto del comprobante ya quedó guardada." };
  }
  const now = deps.now ? deps.now() : new Date();
  if (draft.expiraEn.getTime() <= now.getTime()) {
    return {
      ok: false,
      reason: "Este enlace venció (dura 24 horas). El pago sigue guardado, pero sin la foto del comprobante.",
    };
  }
  return { ok: true, draft };
}

export type PaymentReceiptSubmission =
  | { ok: true; summary: string }
  | { ok: false; reason: string; canRetry: boolean };

// Recibe la foto (no se revisa su contenido) y la pega al pago ya guardado, una sola vez.
export async function receiveSupplierPaymentReceipt(
  deps: SupplierPaymentDeps,
  rawToken: string,
  file: File,
): Promise<PaymentReceiptSubmission> {
  const lookup = await lookupPaymentDraft(deps, rawToken);
  if (!lookup.ok) {
    return { ok: false, reason: lookup.reason, canRetry: false };
  }
  if (file.size === 0) {
    return { ok: false, reason: "Elige o toma una foto primero.", canRetry: true };
  }
  if (file.size > RECEIPT_MAX_BYTES) {
    return { ok: false, reason: "La foto supera el límite de 12 MB.", canRetry: true };
  }
  // El tipo se mira en los bytes: no se confia en el nombre ni en el navegador.
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffReceiptMime(bytes);
  if (!mime) {
    return { ok: false, reason: "El archivo no es compatible. Solo JPG, PNG, WEBP o PDF.", canRetry: true };
  }
  const { draft } = lookup;
  const stored = await deps.receiptStore.save({
    bytes,
    name: file.name,
    ext: RECEIPT_MIME_EXTENSION[mime] as ".jpg" | ".png" | ".webp" | ".pdf",
  });
  try {
    await deps.attachReceipt(draft.id, { ledgerEntryId: draft.ledgerEntryId, url: stored.url, name: stored.name });
  } catch (error) {
    await deps.receiptStore.remove(stored.url).catch(() => undefined);
    if (error instanceof SupplierPaymentDraftUsedError) {
      return { ok: false, reason: error.message, canRetry: false };
    }
    throw error;
  }
  return {
    ok: true,
    summary: `${draft.ofCode ?? "Pago"} · ${draft.supplierName} · ${formatCop(draft.amount)}`,
  };
}
