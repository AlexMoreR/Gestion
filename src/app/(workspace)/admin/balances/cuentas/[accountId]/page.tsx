import { notFound, redirect } from "next/navigation";
import { Wallet } from "lucide-react";
import { auth } from "@/auth";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { getSystemCurrency } from "@/lib/system-settings";
import { createPrismaBalancesRepository } from "@/modules/balances/infrastructure/prisma-balances-repository";
import { AccountBalanceView } from "@/modules/balances/presentation/components/account-balance-view";

type PageProps = {
  params: Promise<{ accountId: string }>;
};

const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  CASH: "Efectivo",
  BANK: "Banco",
  WALLET: "Billetera",
  OTHER: "Otro",
};

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

      <AccountBalanceView
        transactions={transactions}
        openingBalance={account.openingBalance}
        currency={currency}
      />
    </section>
  );
}
