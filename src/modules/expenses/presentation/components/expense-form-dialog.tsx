"use client";

import * as React from "react";
import { ImagePlus, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { DatePicker } from "@/components/ui/date-picker";
import { cn } from "@/lib/utils";

type Option = {
  id: string;
  name: string;
};

type AccountOption = Option & {
  isCash: boolean;
};

type ExpenseInitialValue = {
  expenseId: string;
  categoryId: string;
  accountId: string;
  amount: number;
  description: string | null;
  reference: string | null;
  receiptUrl: string | null;
  receiptName: string | null;
  employeeId: string | null;
  expenseDate: string;
};

type ExpenseFormDialogProps = {
  open: boolean;
  mode: "create" | "edit";
  action: (formData: FormData) => Promise<void>;
  onClose: () => void;
  returnTo: string;
  categories: Option[];
  accounts: AccountOption[];
  employees: Option[];
  initialValue?: ExpenseInitialValue | null;
};

// Detecta la categoria de nomina por nombre (Nomina / Nómina).
function isPayrollName(name: string | undefined): boolean {
  return name ? /n[oó]mina/i.test(name) : false;
}

const controlClassName =
  "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

function isImage(url: string): boolean {
  return /\.(jpe?g|png|webp|gif|avif)$/i.test(url.split("?")[0] ?? "");
}

function today(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function ExpenseFormDialog({
  open,
  mode,
  action,
  onClose,
  returnTo,
  categories,
  accounts,
  employees,
  initialValue,
}: ExpenseFormDialogProps) {
  const [receiptPreview, setReceiptPreview] = React.useState<string | null>(null);
  const [receiptName, setReceiptName] = React.useState<string | null>(null);
  const [removeReceipt, setRemoveReceipt] = React.useState(false);
  const [accountId, setAccountId] = React.useState<string>(initialValue?.accountId ?? "");
  const [categoryId, setCategoryId] = React.useState<string>(initialValue?.categoryId ?? "");
  const [employeeId, setEmployeeId] = React.useState<string>(initialValue?.employeeId ?? "");
  const [amount, setAmount] = React.useState<string>(
    initialValue?.amount ? String(Math.trunc(initialValue.amount)) : "",
  );
  const [receiptError, setReceiptError] = React.useState(false);
  const [employeeError, setEmployeeError] = React.useState(false);

  // Limpia la seleccion al abrir/cerrar o cambiar de gasto.
  React.useEffect(() => {
    setReceiptPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setReceiptName(null);
    setRemoveReceipt(false);
    setReceiptError(false);
    setEmployeeError(false);
    setAccountId(initialValue?.accountId ?? "");
    setCategoryId(initialValue?.categoryId ?? "");
    setEmployeeId(initialValue?.employeeId ?? "");
    setAmount(initialValue?.amount ? String(Math.trunc(initialValue.amount)) : "");
  }, [open, initialValue?.expenseId, initialValue?.accountId, initialValue?.categoryId, initialValue?.employeeId, initialValue?.amount]);

  function handleReceiptChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setReceiptPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file && file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
    });
    setReceiptName(file ? file.name : null);
    setRemoveReceipt(false);
  }

  if (!open) {
    return null;
  }

  const hasCategories = categories.length > 0;
  const hasAccounts = accounts.length > 0;
  const currentReceiptUrl = initialValue?.receiptUrl ?? null;
  const showExistingReceipt = Boolean(currentReceiptUrl) && !receiptName && !removeReceipt;

  // El comprobante es obligatorio salvo en cuentas de efectivo (Caja).
  const selectedAccount = accounts.find((account) => account.id === accountId);
  const accountIsCash = selectedAccount?.isCash ?? false;
  const hasReceipt = Boolean(receiptName) || showExistingReceipt;
  const receiptRequired = !accountIsCash && !hasReceipt;

  // En gastos de nomina hay que indicar el empleado.
  const selectedCategory = categories.find((category) => category.id === categoryId);
  const isPayroll = isPayrollName(selectedCategory?.name);
  const employeeRequired = isPayroll && !employeeId;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (employeeRequired) {
      event.preventDefault();
      setEmployeeError(true);
    }
    if (receiptRequired) {
      event.preventDefault();
      setReceiptError(true);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[55] flex items-end justify-center bg-black/50 p-3 backdrop-blur-[1px] sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={mode === "create" ? "Nuevo gasto" : "Editar gasto"}
      onClick={onClose}
    >
      <Card className="w-full max-w-lg rounded-2xl p-0" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-border px-4 py-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">
              {mode === "create" ? "Nuevo gasto" : "Editar gasto"}
            </h3>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="Cerrar">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {!hasCategories || !hasAccounts ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">
            {!hasCategories ? <p>Primero crea al menos una categoria de gasto.</p> : null}
            {!hasAccounts ? <p>Primero crea al menos una cuenta activa en Balances &gt; Cuentas.</p> : null}
            <div className="mt-4 flex justify-end">
              <Button type="button" variant="outline" onClick={onClose}>
                Entendido
              </Button>
            </div>
          </div>
        ) : (
          <form action={action} onSubmit={handleSubmit} className="space-y-4 px-4 py-4">
            <input type="hidden" name="returnTo" value={returnTo} />
            {mode === "edit" && initialValue ? (
              <input type="hidden" name="expenseId" value={initialValue.expenseId} />
            ) : null}

            {removeReceipt ? <input type="hidden" name="removeReceipt" value="true" /> : null}

            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <div className="shrink-0 space-y-1.5">
                <label
                  className={cn(
                    "relative flex h-28 w-28 cursor-pointer flex-col items-center justify-center gap-1.5 overflow-hidden rounded-lg bg-zinc-200 text-zinc-500 transition hover:bg-zinc-300 hover:text-zinc-600",
                    receiptError && "ring-2 ring-destructive",
                  )}
                  title="Subir comprobante"
                >
                  {receiptPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={receiptPreview} alt="Comprobante" className="absolute inset-0 h-full w-full object-cover" />
                  ) : showExistingReceipt && currentReceiptUrl && isImage(currentReceiptUrl) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={currentReceiptUrl} alt="Comprobante" className="absolute inset-0 h-full w-full object-cover" />
                  ) : (
                    <>
                      <ImagePlus className="size-6" />
                      <span className="text-xs font-medium">Foto</span>
                    </>
                  )}
                  <input
                    type="file"
                    name="receipt"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={handleReceiptChange}
                  />
                </label>
                {receiptName ? (
                  <p className="w-28 truncate text-xs text-muted-foreground">{receiptName}</p>
                ) : null}
                {showExistingReceipt && currentReceiptUrl ? (
                  <div className="flex w-28 items-center gap-2 text-xs">
                    <a
                      href={currentReceiptUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-w-0 items-center gap-1 text-primary hover:underline"
                    >
                      <Paperclip className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">Ver</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => setRemoveReceipt(true)}
                      className="text-destructive hover:underline"
                    >
                      Quitar
                    </button>
                  </div>
                ) : null}
                {removeReceipt ? (
                  <p className="w-28 text-xs text-muted-foreground">Se quitara al guardar.</p>
                ) : null}
              </div>

              <div className="grid flex-1 gap-3 sm:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-foreground">Monto</span>
                  <MoneyInput name="amount" value={amount} onValueChange={setAmount} placeholder="0" />
                </label>

                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-foreground">Fecha</span>
                  <DatePicker
                    name="expenseDate"
                    required
                    defaultValue={initialValue?.expenseDate ?? today()}
                  />
                </label>

                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-foreground">Categoria</span>
                  <select
                    name="categoryId"
                    required
                    className={cn(controlClassName, "appearance-none")}
                    value={categoryId}
                    onChange={(event) => {
                      setCategoryId(event.target.value);
                      setEmployeeError(false);
                    }}
                  >
                    <option value="" disabled>
                      Sin categoria
                    </option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-foreground">Cuenta</span>
                  <select
                    name="accountId"
                    required
                    className={cn(controlClassName, "appearance-none")}
                    value={accountId}
                    onChange={(event) => {
                      setAccountId(event.target.value);
                      setReceiptError(false);
                    }}
                  >
                    <option value="" disabled>
                      Sin cuenta
                    </option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </label>

                {isPayroll ? (
                  <label className="space-y-1.5 sm:col-span-2">
                    <span className="text-sm font-medium text-foreground">
                      Empleado <span className="text-destructive">*</span>
                    </span>
                    <select
                      name="employeeId"
                      required
                      className={cn(
                        controlClassName,
                        "appearance-none",
                        employeeError && "border-destructive ring-2 ring-destructive/30",
                      )}
                      value={employeeId}
                      onChange={(event) => {
                        setEmployeeId(event.target.value);
                        setEmployeeError(false);
                      }}
                    >
                      <option value="" disabled>
                        Selecciona el empleado
                      </option>
                      {employees.map((employee) => (
                        <option key={employee.id} value={employee.id}>
                          {employee.name}
                        </option>
                      ))}
                    </select>
                    {employees.length === 0 ? (
                      <p className="text-xs text-destructive">
                        No hay empleados registrados. Crea uno en Configuracion &gt; Empleados.
                      </p>
                    ) : null}
                  </label>
                ) : null}
              </div>
            </div>

            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-foreground">Descripcion (opcional)</span>
              <textarea
                name="description"
                rows={3}
                className={cn(controlClassName, "h-auto py-2 resize-none")}
                placeholder="Detalle del gasto"
                defaultValue={initialValue?.description ?? ""}
              />
            </label>

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit">{mode === "create" ? "Registrar gasto" : "Guardar cambios"}</Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
