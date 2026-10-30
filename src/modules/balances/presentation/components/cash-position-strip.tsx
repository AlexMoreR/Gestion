import Link from "next/link";
import { AlertTriangle, Banknote, Landmark, Wallet } from "lucide-react";
import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";
import type { CashPosition } from "@/modules/balances/domain/cash-position";

// Franja "Dinero hoy": cuanto hay en efectivo, en bancos y en total, cuenta por cuenta.
// Siempre es el saldo de HOY (no depende del mes que se este mirando).
export function CashPositionStrip({ position, currency }: { position: CashPosition; currency: SupportedCurrencyCode }) {
  const money = (value: number) => formatMoney(value, currency);
  const icon = (type: string) =>
    type === "CASH" ? <Banknote className="h-4 w-4" /> : type === "BANK" ? <Landmark className="h-4 w-4" /> : <Wallet className="h-4 w-4" />;
  const missing = position.withoutAccount;

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">Dinero hoy</h2>
        <p className="text-[11px] text-muted-foreground">Saldo inicial + todo lo que entró − todo lo que salió, por cuenta.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {position.byType.map((group) => (
          <div key={group.type} className="rounded-lg border border-border p-3">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {icon(group.type)}
              {group.label}
            </p>
            <p className={`mt-1 text-lg font-semibold tabular-nums ${group.balance < 0 ? "text-destructive" : "text-foreground"}`}>
              {money(group.balance)}
            </p>
          </div>
        ))}
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
          <p className="text-xs text-muted-foreground">Total disponible</p>
          <p className={`mt-1 text-lg font-bold tabular-nums ${position.total < 0 ? "text-destructive" : "text-foreground"}`}>
            {money(position.total)}
          </p>
        </div>
      </div>

      {position.accounts.length > 0 ? (
        <ul className="grid gap-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {position.accounts.map((account) => (
            <li key={account.id} className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2.5 py-1.5">
              <Link href={`/admin/balances/cuentas/${account.id}`} className="truncate hover:underline">
                {account.name}
                {!account.isActive ? <span className="ml-1 text-[11px] text-amber-600">(inactiva)</span> : null}
              </Link>
              <span className={`tabular-nums font-medium ${account.balance < 0 ? "text-destructive" : ""}`}>{money(account.balance)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">Aún no hay cuentas creadas.</p>
      )}

      {missing.count > 0 ? (
        <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>
            Hay {missing.count} registro(s) de plata sin cuenta asignada, que no suman ni restan en ningún saldo:
            {missing.salePayments.count > 0 ? ` ${missing.salePayments.count} pago(s) de clientes por ${money(missing.salePayments.amount)};` : ""}
            {missing.supplierPayments.count > 0 ? ` ${missing.supplierPayments.count} pago(s) a proveedoras por ${money(missing.supplierPayments.amount)};` : ""}
            {missing.shippingCosts.count > 0 ? ` ${missing.shippingCosts.count} flete(s) por ${money(missing.shippingCosts.amount)};` : ""}
            {" "}hasta asignarles cuenta, el saldo puede no cuadrar con el banco.
            {missing.shippingCosts.count > 0 ? (
              <>
                {" "}
                <Link href="/admin/balances/fletes-sin-cuenta" className="font-semibold underline underline-offset-2">
                  Asignar cuenta a los fletes
                </Link>
              </>
            ) : null}
          </p>
        </div>
      ) : null}
    </div>
  );
}
