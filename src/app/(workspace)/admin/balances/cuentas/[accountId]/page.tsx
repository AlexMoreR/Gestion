import { notFound, redirect } from "next/navigation";
import { Wallet } from "lucide-react";
import { auth } from "@/auth";
import { Card, CardContent } from "@/components/ui/card";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { formatMoney } from "@/lib/currency";
import { getSystemCurrency } from "@/lib/system-settings";
import { createPrismaBalancesRepository } from "@/modules/balances/infrastructure/prisma-balances-repository";
import { AccountTransactionsTable } from "@/modules/balances/presentation/components/account-transactions-table";

type PageProps = {
  params: Promise<{ accountId: string }>;
};

const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  CASH: "Efectivo",
  BANK: "Banco",
  WALLET: "Billetera",
  OTHER: "Otro",
};

function SummaryCard({ title, value, tone = "neutral" }: { title: string; value: string; tone?: "neutral" | "success" | "danger" }) {
  const valueClass =
    tone === "success"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "danger"
        ? "text-destructive"
        : "text-foreground";
  return (
    <Card className="border-border bg-card py-2">
      <CardContent className="space-y-0.5">
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{title}</p>
        <p className={`text-lg font-semibold ${valueClass}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

export default async function AdminAccountTransactionsPage({ params }: PageProps) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN" || !session.user.id) {
    redirect("/unauthorized");
  }

  const canAccess = await hasAdminModuleAccess(session.user.id, session.user.role, "balances");
  if (!canAccess) {
    redirect("/unauthorized");
  }

  const { accountId } = await params;
  const repository = createPrismaBalancesRepository();

  const [currency, balances, transactions] = await Promise.all([
    getSystemCurrency(),
    repository.listAccountBalances(),
    repository.listAccountTransactions(accountId),
  ]);

  const account = balances.find((row) => row.id === accountId);
  if (!account) {
    notFound();
  }

  return (
    <section className="w-full space-y-5">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card text-primary">
            <Wallet className="h-4 w-4" />
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">{account.name}</h1>
            <p className="text-sm text-muted-foreground">
              {ACCOUNT_TYPE_LABEL[account.type] ?? account.type}
              {account.reference ? ` · ${account.reference}` : ""}
              {!account.isActive ? " · Inactiva" : ""}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard title="Saldo inicial" value={formatMoney(account.openingBalance, currency)} />
        <SummaryCard title="Ingresos" value={formatMoney(account.ingreso, currency)} tone="success" />
        <SummaryCard title="Gastos" value={formatMoney(account.gasto, currency)} tone="danger" />
        <SummaryCard title="Movimientos" value={formatMoney(account.movimientos, currency)} />
        <SummaryCard
          title="Balance"
          value={formatMoney(account.balance, currency)}
          tone={account.balance >= 0 ? "success" : "danger"}
        />
      </div>

      <AccountTransactionsTable data={transactions} currency={currency} />
    </section>
  );
}
