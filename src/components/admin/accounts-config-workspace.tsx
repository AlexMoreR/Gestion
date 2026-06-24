"use client";

import * as React from "react";
import { Plus, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SupportedCurrencyCode } from "@/lib/currency";
import type { AccountBalance } from "@/modules/balances/domain/entities";
import {
  adminCreateAccountAction,
  adminCreateAccountMovementAction,
  adminUpdateAccountAction,
} from "@/app/actions/balances-actions";
import { AccountBalancesTable } from "@/modules/balances/presentation/components/account-balances-table";
import { AccountFormDialog } from "@/modules/balances/presentation/components/account-form-dialog";
import { AccountMovementFormDialog } from "@/modules/balances/presentation/components/account-movement-form-dialog";

type AccountsConfigWorkspaceProps = {
  currency: SupportedCurrencyCode;
  accounts: AccountBalance[];
  returnTo?: string;
};

export function AccountsConfigWorkspace({
  currency,
  accounts,
  returnTo = "/admin/configuracion/cuentas",
}: AccountsConfigWorkspaceProps) {
  const [accountModal, setAccountModal] = React.useState<
    | { mode: "create"; initialValue?: null }
    | { mode: "edit"; initialValue: AccountBalance }
    | null
  >(null);
  const [accountMovementOpen, setAccountMovementOpen] = React.useState(false);

  const accountOptions = React.useMemo(
    () => accounts.filter((account) => account.isActive).map((account) => ({ id: account.id, name: account.name })),
    [accounts],
  );

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-foreground">Cuentas</h2>
            <p className="text-xs text-muted-foreground">Gestiona tus cuentas de balance y sus movimientos.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setAccountMovementOpen(true)}>
              <Wallet className="h-4 w-4" />
              Movimiento
            </Button>
            <Button type="button" onClick={() => setAccountModal({ mode: "create", initialValue: null })}>
              <Plus className="h-4 w-4" />
              Nueva cuenta
            </Button>
          </div>
        </div>

        <AccountBalancesTable
          data={accounts}
          currency={currency}
          onEdit={(accountId) => {
            const account = accounts.find((row) => row.id === accountId);
            if (account) {
              setAccountModal({ mode: "edit", initialValue: account });
            }
          }}
        />
      </div>

      <AccountFormDialog
        open={Boolean(accountModal)}
        mode={accountModal?.mode ?? "create"}
        action={accountModal?.mode === "edit" ? adminUpdateAccountAction : adminCreateAccountAction}
        onClose={() => setAccountModal(null)}
        returnTo={returnTo}
        initialValue={accountModal?.mode === "edit" ? accountModal.initialValue : null}
      />

      <AccountMovementFormDialog
        open={accountMovementOpen}
        action={adminCreateAccountMovementAction}
        onClose={() => setAccountMovementOpen(false)}
        returnTo={returnTo}
        accounts={accountOptions}
      />
    </>
  );
}
