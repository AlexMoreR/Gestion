"use client";

import * as React from "react";
import { Plus, PlusCircle, Search, Trash2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import { adminCreateDirectSaleAction } from "@/app/actions/sales-actions";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
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
  retailPrice: number;
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
    <Button type="submit" className="w-full" disabled={pending || disabled}>
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
  const [search, setSearch] = React.useState("");
  const [withPayment, setWithPayment] = React.useState(false);
  // Fecha de la venta. Vacia en el primer render (servidor) y se completa con la
  // fecha de hoy en el cliente para evitar mismatch de hidratacion. Editable para
  // poder cargar ventas de meses anteriores con su fecha real.
  const [saleDate, setSaleDate] = React.useState("");
  React.useEffect(() => {
    if (!saleDate) {
      const now = new Date();
      const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
      setSaleDate(local.toISOString().slice(0, 10));
    }
  }, [saleDate]);

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

  const matches = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products.slice(0, 6);
    return products
      .filter((p) => `${p.code ?? ""} ${p.name}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [products, search]);

  const total = React.useMemo(
    () => lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0),
    [lines],
  );
  const paymentReady = !withPayment || accounts.length > 0;

  function addProduct(product: DirectSaleProduct) {
    // Si es un combo, se separa en sus componentes (cada uno conserva su
    // producto real, su proveedor y su fabricacion); el precio del combo se
    // reparte entre las lineas.
    if (product.isBundle && product.components && product.components.length > 0) {
      const expanded = expandComboLines(product.components, 1, product.retailPrice);
      setLines((prev) => [
        ...prev,
        ...expanded.map((line) => ({
          uid: crypto.randomUUID(),
          productId: line.productId,
          name: line.name,
          code: line.code,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          description: "",
        })),
      ]);
      setSearch("");
      return;
    }

    setLines((prev) => [
      ...prev,
      {
        uid: crypto.randomUUID(),
        productId: product.id,
        name: product.name,
        code: product.code,
        quantity: 1,
        unitPrice: product.retailPrice,
        description: "",
      },
    ]);
    setSearch("");
  }

  function updateLine(uid: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((line) => (line.uid === uid ? { ...line, ...patch } : line)));
  }

  function removeLine(uid: string) {
    setLines((prev) => prev.filter((line) => line.uid !== uid));
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger className={buttonVariants()}>
        <Plus className="h-4 w-4" />
        Venta directa
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-lg">
        <SheetHeader className="border-b border-border pb-4">
          <SheetTitle>Nueva venta directa</SheetTitle>
        </SheetHeader>

        <form
          action={adminCreateDirectSaleAction}
          className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-6 pt-3"
        >
          <input type="hidden" name="returnTo" value="/admin/ventas" />

          {/* Cliente */}
          <div className="space-y-2">
            <label htmlFor="direct-client-mode" className="text-sm font-medium text-foreground">
              Cliente
            </label>

            {/* Campos enviados al servidor */}
            <input type="hidden" name="clientMode" value={clientMode} />
            <input type="hidden" name="clientId" value={clientMode === "existing" ? selectedClientId : ""} />
            <input type="hidden" name="clientName" value={clientMode === "new" ? newName : ""} />
            <input type="hidden" name="clientPhone" value={clientMode === "new" ? newPhone : ""} />
            <input type="hidden" name="clientAddress" value={clientMode === "new" ? newAddress : ""} />
            <input type="hidden" name="clientDocument" value={clientMode === "new" ? newDocument : ""} />
            <input type="hidden" name="clientEmail" value={clientMode === "new" ? newEmail : ""} />

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

          {/* Buscar / agregar productos */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Productos</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className={`${inputClass} pl-9`}
                placeholder="Buscar por nombre o código…"
              />
            </div>
            {search.trim() || matches.length > 0 ? (
              <div className="max-h-44 overflow-y-auto rounded-lg border border-border">
                {matches.length > 0 ? (
                  matches.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => addProduct(product)}
                      className="flex w-full items-center justify-between gap-3 border-b border-border px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-foreground">{product.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{product.code || "Sin código"}</span>
                      </span>
                      <span className="shrink-0 text-xs font-medium text-foreground">
                        {formatMoney(product.retailPrice, currency)}
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="px-3 py-3 text-sm text-muted-foreground">Sin coincidencias.</p>
                )}
              </div>
            ) : null}
          </div>

          {/* Lineas agregadas */}
          <div className="space-y-2">
            {lines.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4 text-center text-sm text-muted-foreground">
                Aún no agregaste productos.
              </div>
            ) : (
              lines.map((line) => (
                <div key={line.uid} className="space-y-2 rounded-lg border border-border bg-muted/10 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{line.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{line.code || "Sin código"}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeLine(line.uid)}
                      className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      aria-label="Quitar producto"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground">Cantidad</label>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={line.quantity}
                        onChange={(event) => updateLine(line.uid, { quantity: Math.max(1, Number(event.target.value) || 1) })}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Precio unitario</label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={line.unitPrice}
                        onChange={(event) => updateLine(line.uid, { unitPrice: Math.max(0, Number(event.target.value) || 0) })}
                        className={inputClass}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Descripción (opcional)</label>
                    <input
                      type="text"
                      value={line.description}
                      onChange={(event) => updateLine(line.uid, { description: event.target.value })}
                      className={inputClass}
                      placeholder="Color, detalle, etc."
                    />
                  </div>
                  <p className="text-right text-sm font-semibold text-foreground">
                    {formatMoney(line.quantity * line.unitPrice, currency)}
                  </p>

                  {/* Campos enviados al servidor */}
                  <input type="hidden" name="itemProductIds" value={line.productId} />
                  <input type="hidden" name="itemQuantities" value={line.quantity} />
                  <input type="hidden" name="itemUnitPrices" value={line.unitPrice} />
                  <input type="hidden" name="itemDescriptions" value={line.description} />
                </div>
              ))
            )}
          </div>

          {/* Fecha de la venta (editable para cargar meses anteriores) */}
          <div className="space-y-1.5">
            <label htmlFor="direct-sale-date" className="text-sm text-foreground">Fecha de la venta</label>
            <input
              id="direct-sale-date"
              name="saleDate"
              type="date"
              required
              value={saleDate}
              onChange={(event) => setSaleDate(event.target.value)}
              className={inputClass}
            />
            <p className="text-xs text-muted-foreground">
              Para cargar ventas anteriores, ajusta esta fecha al mes real.
            </p>
          </div>

          {/* Total */}
          <div className="flex items-center justify-between rounded-lg bg-zinc-100 px-4 py-3">
            <span className="text-sm font-bold uppercase text-slate-900">Total</span>
            <span className="text-lg font-black text-slate-900">{formatMoney(total, currency)}</span>
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

          <CreateButton disabled={!clientReady || lines.length === 0 || !paymentReady} />
          {lines.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground">Agrega al menos un producto para crear la venta.</p>
          ) : !paymentReady ? (
            <p className="text-center text-xs text-muted-foreground">
              Crea una cuenta activa en Balances para registrar el abono.
            </p>
          ) : !clientReady ? (
            <p className="text-center text-xs text-muted-foreground">
              {clientMode === "existing"
                ? "Selecciona un cliente existente."
                : "Completa nombre, teléfono y dirección del cliente."}
            </p>
          ) : null}
        </form>
      </SheetContent>
    </Sheet>
  );
}
