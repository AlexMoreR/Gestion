// Aviso diario de dinero (WhatsApp corto a Alexander por la linea Admin): solo si una cuenta
// quedo en negativo o si en las ultimas 24 h se guardo plata sin cuenta. Si todo esta bien, nada.
// Maximo 2 lineas: una para las cuentas en negativo y otra para lo guardado sin cuenta.

export type AlertAccount = { name: string; balance: number };

export type UnaccountedRecord = {
  kind: "abono" | "flete" | "pago_proveedor";
  // Codigo de la venta (SAL-...) o nombre de la proveedora.
  ref: string;
  amount: number;
  // Retencion en la fuente: nunca entra a una cuenta, no es un olvido (regla de hoy).
  isWithholding?: boolean;
};

export type MoneyAlert = { avisar: boolean; mensaje: string };

const MAX_LISTED = 3;

const KIND_LABEL: Record<UnaccountedRecord["kind"], string> = {
  abono: "abono",
  flete: "flete",
  pago_proveedor: "pago a",
};

export function formatPesos(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? "-" : "";
  return `${sign}$${Math.abs(rounded).toLocaleString("es-CO")}`;
}

function listWithMore(parts: string[]): string {
  const shown = parts.slice(0, MAX_LISTED);
  const rest = parts.length - shown.length;
  if (rest > 0) return `${shown.join(", ")} y ${rest} más`;
  if (shown.length === 1) return shown[0];
  return `${shown.slice(0, -1).join(", ")} y ${shown[shown.length - 1]}`;
}

export function buildMoneyAlert(accounts: AlertAccount[], unaccounted: UnaccountedRecord[]): MoneyAlert {
  const lines: string[] = [];

  const negatives = accounts.filter((account) => Math.round(account.balance) < 0);
  if (negatives.length > 0) {
    lines.push(`${listWithMore(negatives.map((account) => `${account.name} en ${formatPesos(account.balance)}`))}.`);
  }

  const records = unaccounted.filter((record) => !record.isWithholding);
  if (records.length > 0) {
    const parts = records.map((record) => `${KIND_LABEL[record.kind]} ${record.ref} (${formatPesos(record.amount)})`);
    lines.push(`${records.length} sin cuenta en las últimas 24 h: ${listWithMore(parts)}.`);
  }

  return { avisar: lines.length > 0, mensaje: lines.join("\n") };
}
