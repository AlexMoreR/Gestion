"use client";

import * as React from "react";
import { AlignLeft, Boxes, Coins, Plus, PlusCircle, RefreshCw, Search, ShoppingCart, Trash2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import { adminCreateDirectSaleAction } from "@/app/actions/sales-actions";
import { ProductThumb } from "@/components/admin/product-thumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { TransactionModal } from "@/components/ui/transaction-modal";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { expandComboLines, type ComboComponent } from "@/lib/combo";
import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";

export type DirectSaleProduct = {
  id: string;
  name: string;
  code: string | null;
  stock: number;
  retailPrice: number;
  wholesalePrice: number;
  minWholesaleQty: number;
  thumbnailUrl?: string | null;
  isBundle?: boolean;
  components?: ComboComponent[];
};

export type DirectSaleClient = {
  id: string;
  name: string;
  email: string;
  document: string;
  phone: string;
  address: string;
};

type AccountType = "CASH" | "BANK" | "WALLET" | "OTHER";

type AccountOption = {
  id: string;
  name: string;
  type: AccountType;
};

type ClientMode = "final" | "existing" | "new";

type DraftLine = {
  uid: string;
  productId: string;
  name: string;
  code: string | null;
  quantity: number;
  unitPrice: number;
  description: string;
};

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

function todayInputValue(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function getAccountTypeLabel(type: AccountType): string {
  switch (type) {
    case "CASH":
      return "Efectivo";
    case "BANK":
      return "Banco";
    case "WALLET":
      return "Billetera";
    case "OTHER":
      return "Otro";
    default:
      return type;
  }
}

function CreateButton({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={pending || disabled}>
      <PlusCircle className="h-4 w-4" />
      {pending ? "Creando venta..." : "Crear venta"}
    </Button>
  );
}

export function DirectSaleSheet({
  products,
  clients,
  currency,
  accounts,
}: {
  products: DirectSaleProduct[];
  clients: DirectSaleClient[];
  currency: SupportedCurrencyCode;
  accounts: AccountOption[];
}) {
  const [open, setOpen] = React.useState(false);
  const [lines, setLines] = React.useState<DraftLine[]>([]);
  const [withPayment, setWithPayment] = React.useState(false);
  const [saleDate, setSaleDate] = React.useState(todayInputValue());
  // Modo mayorista: usa el wholesalePrice de cada producto.
  const [wholesaleMode, setWholesaleMode] = React.useState(false);

  // Modal de selección de producto (mismo flujo que cotización).
  const [openProductModal, setOpenProductModal] = React.useState(false);
  const [productLookup, setProductLookup] = React.useState("");
  const [draftProductId, setDraftProductId] = React.useState("");
  const [draftQuantity, setDraftQuantity] = React.useState("1");
  const [draftUnitPrice, setDraftUnitPrice] = React.useState("");
  const [draftDescription, setDraftDescription] = React.useState("");
  const [productFormError, setProductFormError] = React.useState("");

  // Cliente
  const [clientMode, setClientMode] = React.useState<ClientMode>("final");
  const [clientSearch, setClientSearch] = React.useState("");
  const [showClientResults, setShowClientResults] = React.useState(false);
  const [selectedClientId, setSelectedClientId] = React.useState("");
  const [newName, setNewName] = React.useState("");
  const [newPhone, setNewPhone] = React.useState("");
  const [newAddress, setNewAddress] = React.useState("");
  const [newDocument, setNewDocument] = React.useState("");
  const [newEmail, setNewEmail] = React.useState("");

  const selectedClient = React.useMemo(
    () => clients.find((client) => client.id === selectedClientId) ?? null,
    [clients, selectedClientId],
  );

  const clientMatches = React.useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) return clients.slice(0, 8);
    return clients
      .filter((c) => `${c.name} ${c.email} ${c.document} ${c.phone}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [clients, clientSearch]);

  function selectExistingClient(client: DirectSaleClient) {
    setSelectedClientId(client.id);
    setClientSearch(client.name);
    setShowClientResults(false);
  }

  const clientReady =
    clientMode === "final" ||
    (clientMode === "existing" && Boolean(selectedClientId)) ||
    (clientMode === "new" && Boolean(newName.trim() && newPhone.trim() && newAddress.trim()));

  const filteredProducts = React.useMemo(() => {
    const q = productLookup.trim().toLowerCase();
    if (!q) return products.slice(0, 24);
    return products
      .filter((p) => `${p.code ?? ""} ${p.name}`.toLowerCase().includes(q))
      .slice(0, 24);
  }, [products, productLookup]);

  const draftProduct = draftProductId ? products.find((p) => p.id === draftProductId) ?? null : null;

  const total = React.useMemo(
    () => lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0),
    [lines],
  );
  const paymentReady = !withPayment || accounts.length > 0;

  const resetDraft = () => {
    setProductLookup("");
    setDraftProductId("");
    setDraftQuantity("1");
    setDraftUnitPrice("");
    setDraftDescription("");
    setProductFormError("");
  };

  const openAddProductModal = () => {
    resetDraft();
    setOpenProductModal(true);
  };

  const priceForMode = (product: DirectSaleProduct): number =>
    wholesaleMode && product.wholesalePrice > 0 ? product.wholesalePrice : product.retailPrice;

  const applyProductSelection = (product: DirectSaleProduct) => {
    setDraftProductId(product.id);
    setProductLookup(product.code || product.name);
    setDraftUnitPrice(String(priceForMode(product)));
    setProductFormError("");
  };

  // Cambia el modo mayorista y re-precia las lineas ya agregadas.
  const applyWholesaleMode = (next: boolean) => {
    setWholesaleMode(next);
    setLines((current) =>
      current.map((line) => {
        const product = products.find((item) => item.id === line.productId);
        if (!product) return line;
        return {
          ...line,
          unitPrice: next && product.wholesalePrice > 0 ? product.wholesalePrice : product.retailPrice,
        };
      }),
    );
  };

  const clearDraftSelection = () => {
    setDraftProductId("");
    setProductLookup("");
    setDraftUnitPrice("");
    setProductFormError("");
  };

  const draftLineTotal =
    (Number(draftUnitPrice) || 0) * (Math.trunc(Number(draftQuantity) || 0) || 0);

  const addDraftProduct = () => {
    setProductFormError("");
    if (!draftProduct) {
      setProductFormError("Selecciona un producto.");
      return;
    }
    const quantity = Math.trunc(Number(draftQuantity) || 0);
    if (quantity <= 0) {
      setProductFormError("La cantidad debe ser mayor a 0.");
      return;
    }
    const unitPrice = Number(draftUnitPrice) || 0;
    if (unitPrice <= 0) {
      setProductFormError("El precio debe ser mayor a 0.");
      return;
    }

    // Si es un combo, se separa en sus componentes (cada uno conserva su
    // producto real); el precio del combo se reparte entre las líneas.
    if (draftProduct.isBundle && draftProduct.components && draftProduct.components.length > 0) {
      const expanded = expandComboLines(draftProduct.components, quantity, unitPrice);
      setLines((prev) => [
        ...prev,
        ...expanded.map((line) => ({
          uid: crypto.randomUUID(),
          productId: line.productId,
          name: line.name,
          code: line.code,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          description: draftDescription.trim(),
        })),
      ]);
      setOpenProductModal(false);
      resetDraft();
      return;
    }

    setLines((prev) => [
      ...prev,
      {
        uid: crypto.randomUUID(),
        productId: draftProduct.id,
        name: draftProduct.name,
        code: draftProduct.code,
        quantity,
        unitPrice,
        description: draftDescription.trim(),
      },
    ]);
    setOpenProductModal(false);
    resetDraft();
  };

  function removeLine(uid: string) {
    setLines((prev) => prev.filter((line) => line.uid !== uid));
  }

  const handleClose = () => {
    setOpen(false);
  };

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Venta directa
      </Button>

      <TransactionModal
        open={open}
        onOpenChange={(value) => (value ? setOpen(true) : handleClose())}
        title="Venta directa"
        icon={<ShoppingCart className="h-4 w-4" />}
        headerExtra={
          <DatePicker name="saleDate" required value={saleDate} onChange={setSaleDate} className="w-40" />
        }
        formProps={{ action: adminCreateDirectSaleAction }}
        hiddenFields={
          <>
            <input type="hidden" name="returnTo" value="/admin/ventas" />
            <input type="hidden" name="clientMode" value={clientMode} />
            <input type="hidden" name="clientId" value={clientMode === "existing" ? selectedClientId : ""} />
            <input type="hidden" name="clientName" value={clientMode === "new" ? newName : ""} />
            <input type="hidden" name="clientPhone" value={clientMode === "new" ? newPhone : ""} />
            <input type="hidden" name="clientAddress" value={clientMode === "new" ? newAddress : ""} />
            <input type="hidden" name="clientDocument" value={clientMode === "new" ? newDocument : ""} />
            <input type="hidden" name="clientEmail" value={clientMode === "new" ? newEmail : ""} />
          </>
        }
        total={{ label: "Total", value: formatMoney(total, currency) }}
        actions={
          <>
            <Button type="button" variant="outline" size="lg" onClick={handleClose}>
              Cancelar
            </Button>
            <CreateButton disabled={!clientReady || lines.length === 0 || !paymentReady} />
          </>
        }
      >
        {/* Cliente */}
        <div className="space-y-2">
          <label htmlFor="direct-client-mode" className="text-sm font-medium text-foreground">
            Cliente
          </label>

          <Select
            value={clientMode}
            onValueChange={(value) => {
              if (value === "final" || value === "existing" || value === "new") {
                setClientMode(value);
              }
            }}
          >
            <SelectTrigger id="direct-client-mode" className="h-10 w-full bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="start">
              <SelectItem value="final">Consumidor final</SelectItem>
              <SelectItem value="existing">Cliente existente</SelectItem>
              <SelectItem value="new">Nuevo cliente</SelectItem>
            </SelectContent>
          </Select>

          {clientMode === "final" ? (
            <p className="text-xs text-muted-foreground">La venta se registrará a nombre de “Consumidor final”.</p>
          ) : null}

          {clientMode === "existing" ? (
            <div className="relative space-y-1.5">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={clientSearch}
                  onChange={(event) => {
                    setClientSearch(event.target.value);
                    setSelectedClientId("");
                    setShowClientResults(true);
                  }}
                  onFocus={() => setShowClientResults(true)}
                  onBlur={() => setTimeout(() => setShowClientResults(false), 120)}
                  className={`${inputClass} pl-9`}
                  placeholder="Buscar cliente por nombre, documento o teléfono…"
                />
              </div>
              {showClientResults ? (
                <div className="absolute left-0 right-0 top-full z-30 mt-1.5 max-h-52 overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
                  {clientMatches.length > 0 ? (
                    clientMatches.map((client) => (
                      <button
                        key={client.id}
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => selectExistingClient(client)}
                        className="flex w-full items-center justify-between gap-3 border-b border-border px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted"
                      >
                        <span className="min-w-0 truncate font-medium text-foreground">{client.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{client.phone || "Sin teléfono"}</span>
                      </button>
                    ))
                  ) : (
                    <p className="px-3 py-3 text-sm text-muted-foreground">Sin coincidencias.</p>
                  )}
                </div>
              ) : null}
              {selectedClient ? (
                <p className="text-xs text-emerald-600 dark:text-emerald-400">
                  Cliente seleccionado: {selectedClient.name}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">Selecciona un cliente de la lista.</p>
              )}
            </div>
          ) : null}

          {clientMode === "new" ? (
            <div className="space-y-2 rounded-lg border border-border p-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <label htmlFor="new-client-name" className="text-xs text-muted-foreground">
                    Nombre y apellido *
                  </label>
                  <input
                    id="new-client-name"
                    type="text"
                    value={newName}
                    onChange={(event) => setNewName(event.target.value)}
                    className={inputClass}
                    placeholder="Ej: Ana Pérez"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="new-client-phone" className="text-xs text-muted-foreground">
                    Teléfono *
                  </label>
                  <input
                    id="new-client-phone"
                    type="text"
                    value={newPhone}
                    onChange={(event) => setNewPhone(event.target.value)}
                    className={inputClass}
                    placeholder="Ej: 3001234567"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label htmlFor="new-client-address" className="text-xs text-muted-foreground">
                  Dirección *
                </label>
                <input
                  id="new-client-address"
                  type="text"
                  value={newAddress}
                  onChange={(event) => setNewAddress(event.target.value)}
                  className={inputClass}
                  placeholder="Ej: Calle 1 # 2-3"
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <label htmlFor="new-client-document" className="text-xs text-muted-foreground">
                    Documento (opcional)
                  </label>
                  <input
                    id="new-client-document"
                    type="text"
                    value={newDocument}
                    onChange={(event) => setNewDocument(event.target.value)}
                    className={inputClass}
                    placeholder="Ej: 123456789"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="new-client-email" className="text-xs text-muted-foreground">
                    Correo (opcional)
                  </label>
                  <input
                    id="new-client-email"
                    type="email"
                    value={newEmail}
                    onChange={(event) => setNewEmail(event.target.value)}
                    className={inputClass}
                    placeholder="cliente@correo.com"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">* Campos obligatorios. El cliente quedará guardado para futuras ventas.</p>
            </div>
          ) : null}
        </div>

        {/* Productos */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-sm font-medium text-foreground">Productos</label>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--primary)]"
                checked={wholesaleMode}
                onChange={(event) => applyWholesaleMode(event.target.checked)}
              />
              <span className="font-medium text-foreground">Al por mayor</span>
            </label>
          </div>
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Producto</th>
                  <th className="px-3 py-2 text-right">Cant</th>
                  <th className="px-3 py-2 text-right">Precio</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-10 text-center text-sm text-muted-foreground">
                      <div className="flex flex-col items-center gap-3">
                        <div className="rounded-full border border-border bg-muted p-2">
                          <Boxes className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <p>Aún no agregaste productos.</p>
                        <Button type="button" size="lg" onClick={openAddProductModal}>
                          <Plus className="h-4 w-4" />
                          Agregar producto
                        </Button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  lines.map((line) => (
                    <tr key={line.uid} className="border-t border-border">
                      <td className="px-3 py-2 text-foreground">
                        <p className="font-medium">{line.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {line.code || "Sin código"}
                          {line.description ? ` · ${line.description}` : ""}
                        </p>
                        {/* Campos enviados al servidor */}
                        <input type="hidden" name="itemProductIds" value={line.productId} />
                        <input type="hidden" name="itemQuantities" value={line.quantity} />
                        <input type="hidden" name="itemUnitPrices" value={line.unitPrice} />
                        <input type="hidden" name="itemDescriptions" value={line.description} />
                      </td>
                      <td className="px-3 py-2 text-right text-foreground">{line.quantity}</td>
                      <td className="px-3 py-2 text-right text-foreground">{formatMoney(line.unitPrice, currency)}</td>
                      <td className="px-3 py-2 text-right font-semibold text-foreground">
                        {formatMoney(line.quantity * line.unitPrice, currency)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeLine(line.uid)}
                          aria-label="Quitar producto"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {lines.length > 0 ? (
            <div className="flex justify-center">
              <Button type="button" size="lg" onClick={openAddProductModal}>
                <Plus className="h-4 w-4" />
                Agregar producto
              </Button>
            </div>
          ) : null}
        </div>

        {/* Pago opcional */}
        <div className="space-y-3 rounded-lg border border-border p-3">
          <label className="flex items-center gap-2 text-sm font-medium text-foreground">
            <input
              type="checkbox"
              checked={withPayment}
              onChange={(event) => setWithPayment(event.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            Registrar un abono ahora
          </label>

          {withPayment ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label htmlFor="direct-amount" className="text-sm text-foreground">Monto del abono</label>
                <input
                  id="direct-amount"
                  name="amount"
                  type="number"
                  min="0.01"
                  max={total || undefined}
                  step="0.01"
                  className={inputClass}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="direct-account" className="text-sm text-foreground">Cuenta de balance</label>
                <select
                  id="direct-account"
                  name="accountId"
                  required
                  defaultValue={accounts[0]?.id ?? ""}
                  disabled={accounts.length === 0}
                  className={inputClass}
                >
                  {accounts.length === 0 ? (
                    <option value="">Sin cuentas activas</option>
                  ) : (
                    accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name} - {getAccountTypeLabel(account.type)}
                      </option>
                    ))
                  )}
                </select>
                {accounts.length === 0 ? (
                  <p className="text-xs text-destructive">
                    Crea una cuenta activa en Balances para registrar el abono.
                  </p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <label htmlFor="direct-receipt" className="text-sm text-foreground">Comprobante</label>
                <input
                  id="direct-receipt"
                  name="receipt"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  className={inputClass}
                />
                <p className="text-xs text-muted-foreground">Obligatorio si la cuenta no es de efectivo.</p>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="direct-note" className="text-sm text-foreground">Nota (opcional)</label>
                <input id="direct-note" name="note" type="text" className={inputClass} />
              </div>
            </div>
          ) : null}
        </div>
      </TransactionModal>

      {/* Modal de selección de producto (mismo flujo que cotización) */}
      <Dialog
        open={open && openProductModal}
        onOpenChange={(value) => (value ? null : setOpenProductModal(false))}
      >
        <DialogContent className="flex max-h-[88vh] w-[calc(100%-1.5rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 px-5 py-4">
            <DialogTitle className="inline-flex items-center gap-2 pr-8 text-base font-semibold text-foreground">
              <Boxes className="h-4 w-4 text-muted-foreground" />
              <span>Agregar producto</span>
            </DialogTitle>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {!draftProductId ? (
              <div className="space-y-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={productLookup}
                    onChange={(event) => setProductLookup(event.target.value)}
                    className="pl-9"
                    placeholder="Buscar codigo o producto"
                    autoFocus
                  />
                </div>

                {filteredProducts.length > 0 ? (
                  <div className="grid max-h-[60vh] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
                    {filteredProducts.map((product) => (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => applyProductSelection(product)}
                        className="flex items-stretch overflow-hidden rounded-md border border-border bg-card text-left transition hover:border-[var(--primary)]/40 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <div className="relative w-14 shrink-0 self-stretch">
                          <ProductThumb
                            src={product.thumbnailUrl ?? ""}
                            alt={product.name}
                            className="h-full w-full bg-muted object-cover"
                          />
                          {/* Bolita de stock; para combos es cuantos se pueden armar con sus componentes */}
                          <span
                            className={`absolute bottom-0.5 right-0 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-semibold text-white shadow ${
                              product.stock <= 0 ? "bg-red-500" : "bg-emerald-500"
                            }`}
                          >
                            {product.stock}
                          </span>
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 p-2.5">
                          <p className="truncate text-sm font-medium text-foreground">{product.name}</p>
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-xs text-muted-foreground">{product.code || "Sin codigo"}</p>
                            <span className="shrink-0 text-xs font-semibold text-foreground">
                              {formatMoney(product.retailPrice, currency)}
                            </span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-border bg-card px-3 py-10 text-center text-sm text-muted-foreground">
                    Sin coincidencias
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="mb-3 flex items-center gap-3 rounded-xl border border-[var(--primary)]/30 bg-[var(--primary)]/5 p-2.5">
                  <ProductThumb
                    src={draftProduct?.thumbnailUrl ?? ""}
                    alt={draftProduct?.name ?? ""}
                    className="h-12 w-12 shrink-0 rounded-md border border-border object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{draftProduct?.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{draftProduct?.code || "Sin codigo"}</p>
                  </div>
                  <label className="flex shrink-0 flex-col gap-1">
                    <span className="text-[11px] font-medium text-muted-foreground">Cantidad</span>
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      value={draftQuantity}
                      onChange={(event) => setDraftQuantity(event.target.value)}
                      className="h-9 w-20"
                    />
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={clearDraftSelection}
                    aria-label="Cambiar producto"
                    title="Cambiar producto"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>

                <div className="grid gap-3 rounded-xl border border-border bg-muted/60 p-3 md:grid-cols-2">
                  <label className="space-y-1.5">
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
                      <Coins className="h-3.5 w-3.5 text-muted-foreground" />
                      Precio de venta
                    </span>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={draftUnitPrice}
                      onChange={(event) => setDraftUnitPrice(event.target.value)}
                      placeholder="0"
                    />
                  </label>

                  <label className="space-y-1.5">
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
                      <AlignLeft className="h-3.5 w-3.5 text-muted-foreground" />
                      Descripcion
                    </span>
                    <Input
                      value={draftDescription}
                      onChange={(event) => setDraftDescription(event.target.value)}
                      placeholder="Color, detalle, etc."
                    />
                  </label>
                </div>

                {productFormError ? (
                  <p className="mt-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
                    {productFormError}
                  </p>
                ) : null}

                {/* Aviso (no bloquea) si la cantidad no llega al minimo mayorista. */}
                {wholesaleMode &&
                draftProduct &&
                draftProduct.wholesalePrice > 0 &&
                (Number(draftQuantity) || 0) < draftProduct.minWholesaleQty ? (
                  <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-600 dark:text-amber-400">
                    Cantidad menor al minimo mayorista ({draftProduct.minWholesaleQty}) para este producto.
                  </p>
                ) : null}

                <div className="mt-3 flex items-center justify-between rounded-xl border border-[var(--primary)]/20 bg-[var(--primary)]/5 px-4 py-3">
                  <span className="text-sm font-semibold text-foreground">Total</span>
                  <span className="text-xl font-bold text-[var(--primary)]">
                    {formatMoney(draftLineTotal, currency)}
                  </span>
                </div>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <Button type="button" variant="outline" size="lg" onClick={() => setOpenProductModal(false)}>
                    Cancelar
                  </Button>
                  <Button type="button" size="lg" onClick={addDraftProduct}>
                    Agregar producto
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
