"use client";

import { useMemo, useState } from "react";
import { Plus, Truck, X } from "lucide-react";
import {
  adminCreateSupplierAction,
  adminUpdateSupplierAction,
} from "@/app/actions/catalog-actions";
import { adminCreateSupplierPaymentAction } from "@/app/actions/supplier-ledger-actions";
import { SuppliersDataTable } from "@/components/admin/suppliers-data-table";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";
import { Button } from "../ui/button";

type LedgerEntry = {
  id: string;
  type: "CHARGE" | "PAYMENT";
  amount: number;
  note: string | null;
  createdAt: string;
  createdByName: string | null;
};

type SupplierType = "MANUFACTURER" | "SHIPPING";

type SupplierRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  type: SupplierType;
  productsCount: number;
  balance: number;
  ledger: LedgerEntry[];
};

type SuppliersWorkspaceProps = {
  suppliers: SupplierRow[];
  currency: SupportedCurrencyCode;
};

export function SuppliersWorkspace({ suppliers, currency }: SuppliersWorkspaceProps) {
  const [modal, setModal] = useState<"new" | "edit" | "ledger" | null>(null);
  const [activeSupplierId, setActiveSupplierId] = useState<string | null>(null);

  const activeSupplier = useMemo(
    () => suppliers.find((supplier) => supplier.id === activeSupplierId) ?? null,
    [suppliers, activeSupplierId],
  );

  const openNewModal = () => {
    setActiveSupplierId(null);
    setModal("new");
  };

  const openEditModal = (supplierId: string) => {
    setActiveSupplierId(supplierId);
    setModal("edit");
  };

  const openLedgerModal = (supplierId: string) => {
    setActiveSupplierId(supplierId);
    setModal("ledger");
  };

  const closeModal = () => {
    setModal(null);
    setActiveSupplierId(null);
  };

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="inline-flex items-center gap-1 text-lg font-semibold tracking-tight text-slate-900 md:text-xl">
            <Truck className="h-4 w-4 text-slate-500" />
            <span>Proveedores</span>
          </h1>
          <p className="mt-1 text-xs text-slate-600">
            Crea, edita y elimina proveedores del catalogo.
          </p>
        </div>
        <Button
          type="button"
          onClick={openNewModal}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 text-sm font-medium text-white transition hover:bg-[var(--primary-strong)]"
        >
          <Plus className="h-4 w-4" />
          Nuevo proveedor
        </Button>
      </div>

      <SuppliersDataTable
        suppliers={suppliers}
        currency={currency}
        onEditSupplier={openEditModal}
        onViewLedger={openLedgerModal}
      />

      {modal === "new" ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#11182752] px-4"
          role="dialog"
          aria-modal="true"
          aria-label="Nuevo proveedor"
          onClick={closeModal}
        >
          <Card
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Nuevo proveedor</h2>
              <Button
                type="button"
                onClick={closeModal}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[(--line)] text-slate-600 transition hover:bg-slate-50"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <form action={adminCreateSupplierAction} className="space-y-3">
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-700">Nombre</span>
                <Input name="name" placeholder="Ej. Textiles Andina" required />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-700">Tipo de proveedor</span>
                <select
                  name="type"
                  defaultValue="MANUFACTURER"
                  className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <option value="MANUFACTURER">Fabricante</option>
                  <option value="SHIPPING">Envios</option>
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-slate-700">Correo</span>
                  <Input name="email" type="email" placeholder="ventas@proveedor.com" />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-slate-700">Telefono</span>
                  <Input name="phone" placeholder="+57 300..." />
                </label>
              </div>
              <Button type="submit" className="h-10 w-full">
                Guardar proveedor
              </Button>
            </form>
          </Card>
        </div>
      ) : null}

      {modal === "edit" && activeSupplier ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#11182752] px-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Editar ${activeSupplier.name}`}
          onClick={closeModal}
        >
          <Card
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Editar proveedor</h2>
              <Button
                type="button"
                onClick={closeModal}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[(--line)] text-slate-600 transition hover:bg-slate-50"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <form action={adminUpdateSupplierAction} className="space-y-3">
              <input type="hidden" name="supplierId" value={activeSupplier.id} />
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-700">Nombre</span>
                <Input name="name" defaultValue={activeSupplier.name} required />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-700">Tipo de proveedor</span>
                <select
                  name="type"
                  defaultValue={activeSupplier.type}
                  className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <option value="MANUFACTURER">Fabricante</option>
                  <option value="SHIPPING">Envios</option>
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-slate-700">Correo</span>
                  <Input
                    name="email"
                    type="email"
                    defaultValue={activeSupplier.email ?? ""}
                    placeholder="ventas@proveedor.com"
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-slate-700">Telefono</span>
                  <Input
                    name="phone"
                    defaultValue={activeSupplier.phone ?? ""}
                    placeholder="+57 300..."
                  />
                </label>
              </div>
              <Button type="submit" className="h-10 w-full">
                Guardar cambios
              </Button>
            </form>
          </Card>
        </div>
      ) : null}

      {modal === "ledger" && activeSupplier ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#11182752] px-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Cuenta corriente de ${activeSupplier.name}`}
          onClick={closeModal}
        >
          <Card
            className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Cuenta corriente</h2>
              <Button
                type="button"
                onClick={closeModal}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[(--line)] text-slate-600 transition hover:bg-slate-50"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="rounded-lg border border-[(--line)] bg-slate-50 p-3">
              <p className="text-sm font-medium text-slate-900">{activeSupplier.name}</p>
              <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-500">Saldo pendiente</p>
              <p
                className={`text-2xl font-semibold ${
                  activeSupplier.balance > 0 ? "text-red-600" : "text-emerald-600"
                }`}
              >
                {formatMoney(activeSupplier.balance, currency)}
              </p>
            </div>

            <form action={adminCreateSupplierPaymentAction} className="mt-4 space-y-3">
              <input type="hidden" name="supplierId" value={activeSupplier.id} />
              <input type="hidden" name="returnTo" value="/admin/proveedores" />
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-slate-700">Monto del abono</span>
                  <Input name="amount" type="number" step="0.01" min="0" placeholder="0.00" required />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-slate-700">Nota</span>
                  <Input name="note" placeholder="Referencia del pago" />
                </label>
              </div>
              <Button type="submit" className="h-10 w-full">
                Registrar abono
              </Button>
            </form>

            <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Movimientos</p>
              {activeSupplier.ledger.length === 0 ? (
                <p className="text-sm text-slate-500">Sin movimientos registrados.</p>
              ) : (
                activeSupplier.ledger.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-start justify-between gap-3 rounded-lg border border-[(--line)] p-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">
                        {entry.type === "CHARGE" ? "Cargo" : "Abono"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {new Date(entry.createdAt).toLocaleDateString("es-CO")}
                        {entry.note ? ` - ${entry.note}` : ""}
                      </p>
                      <p className="text-xs text-slate-400">{entry.createdByName ?? "Sistema"}</p>
                    </div>
                    <p
                      className={`shrink-0 text-sm font-semibold ${
                        entry.type === "CHARGE" ? "text-red-600" : "text-emerald-600"
                      }`}
                    >
                      {entry.type === "CHARGE" ? "+" : "-"}
                      {formatMoney(entry.amount, currency)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      ) : null}
    </>
  );
}
