// Registrar el pago a la proveedora de una orden de fabricacion (OF) hablandole a Claude (MCP), en
// dos pasos como registrar_gasto: preparar (repetir el resumen, no guarda) y confirmar (guarda UN
// abono PAYMENT en la cuenta de la proveedora). Nunca crea un gasto: el pago a la proveedora ya es
// costo de la venta, y como gasto se contaria dos veces. Todo entra por puertos para probarlo en memoria.

import { diaBogota, fechaPuestaParaGuardar } from "../../retroactivos/domain/retroactivo";
import { resolveAccount, type AccountOption } from "../../expenses/domain/expense-draft";
import { formatCop } from "../../expenses/domain/receipt-check";
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
  // ANTICIPO_50_50 | CONTRAENTREGA | null (sin definir)
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
  now?: () => Date;
};

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
  const code = input.of.trim().toUpperCase();
  if (!OF_RE.test(code)) {
    throw new SupplierPaymentInputError(`"${input.of}" no es un código de orden de fabricación (ej. OF-00035).`);
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

export type ConfirmedSupplierPayment = { paymentId: string; balance: OfBalance; summary: string };

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
  const now = deps.now ? deps.now() : new Date();
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

  return { paymentId: created.id, balance, summary: describeSupplierPayment(prepared) };
}
