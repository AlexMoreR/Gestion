import { HandCoins } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { colombiaDayKey } from "@/lib/colombia-time";
import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";
import { resolveMonthPeriod } from "@/lib/month-period";
import type { OwnerContributionMonth } from "../../domain/owner-contributions";

type OwnerContributionsCardProps = {
  months: OwnerContributionMonth[];
  currency: SupportedCurrencyCode;
};

const dayLabel = (date: Date) => colombiaDayKey(date).split("-").reverse().join("/");

// Suma de los gastos pagados con la cuenta "Aportes del dueño": no es un saldo ni plata del negocio.
export function OwnerContributionsCard({ months, currency }: OwnerContributionsCardProps) {
  return (
    <Card className="border-border bg-card">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start gap-2">
          <HandCoins className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">Aportes del dueño</h3>
            <p className="text-xs text-muted-foreground">
              Gastos de Magilus pagados con tu plata. Cuentan para la ganancia, pero no bajan ningún banco.
            </p>
          </div>
        </div>
        {months.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aún no hay aportes. Al registrar un gasto, elige la cuenta &quot;Aportes del dueño&quot;.
          </p>
        ) : (
          <div className="space-y-2">
            {months.map((month) => (
              <details key={month.month} className="rounded-xl border border-border px-3 py-2">
                <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm">
                  <span className="font-medium capitalize text-foreground">
                    {resolveMonthPeriod(month.month).label}
                    <span className="ml-1 font-normal normal-case text-muted-foreground">
                      · {month.expenses.length} {month.expenses.length === 1 ? "gasto" : "gastos"}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold text-foreground">{formatMoney(month.total, currency)}</span>
                </summary>
                <ul className="mt-2 space-y-1.5 border-t border-border pt-2">
                  {month.expenses.map((expense) => (
                    <li key={expense.id} className="flex items-start justify-between gap-3 text-xs">
                      <div className="min-w-0">
                        <p className="text-foreground">
                          {dayLabel(expense.date)} · {expense.categoryName}
                        </p>
                        {expense.note ? <p className="break-words text-muted-foreground">{expense.note}</p> : null}
                      </div>
                      <span className="shrink-0 font-medium text-foreground">{formatMoney(expense.amount, currency)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
