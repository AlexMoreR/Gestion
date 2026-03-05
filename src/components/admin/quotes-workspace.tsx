"use client";

import { useMemo, useState } from "react";
import { FileText, Plus, Search, UserPlus, X } from "lucide-react";
import { adminCreateClientQuickAction, adminCreateQuoteAction } from "@/app/actions/quote-actions";
import { QuotesDataTable } from "@/components/admin/quotes-data-table";
import { Input } from "@/components/ui/input";
import type { SupportedCurrencyCode } from "@/lib/currency";

type ClientOption = {
  id: string;
  name: string;
  email: string;
};

type ProductSupplierOption = {
  id: string;
  name: string;
};

type ProductOption = {
  id: string;
  name: string;
  code: string | null;
  retailPrice: number;
  suppliers: ProductSupplierOption[];
};

type QuoteRow = {
  id: string;
  code: string;
  clientName: string;
  itemsCount: number;
  total: number;
  status: "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED";
  createdAt: string;
  shareToken: string;
};

type QuoteLine = {
  uid: string;
  productId: string;
  supplierId: string;
  quantity: number;
  unitPrice: number;
};

type QuotesWorkspaceProps = {
  quotes: QuoteRow[];
  clients: ClientOption[];
  products: ProductOption[];
  currency: SupportedCurrencyCode;
};

export function QuotesWorkspace({ quotes, clients, products, currency }: QuotesWorkspaceProps) {
  const [openModal, setOpenModal] = useState(false);
  const [openClientModal, setOpenClientModal] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [clientQuery, setClientQuery] = useState("");
  const [clientId, setClientId] = useState<string>(clients[0]?.id ?? "");
  const [notes, setNotes] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [lines, setLines] = useState<QuoteLine[]>([]);

  const filteredClients = useMemo(() => {
    const q = clientQuery.trim().toLowerCase();
    if (!q) {
      return clients;
    }
    return clients.filter((client) => `${client.name} ${client.email}`.toLowerCase().includes(q));
  }, [clients, clientQuery]);

  const selectedClient = useMemo(() => clients.find((client) => client.id === clientId), [clients, clientId]);

  const filteredProducts = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    if (!q) {
      return products.slice(0, 8);
    }
    return products.filter((product) => `${product.name} ${product.code ?? ""}`.toLowerCase().includes(q)).slice(0, 8);
  }, [products, productQuery]);

  const linesWithMeta = useMemo(
    () =>
      lines.map((line) => {
        const product = products.find((item) => item.id === line.productId);
        return { line, product };
      }),
    [lines, products],
  );

  const quoteTotal = useMemo(() => lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0), [lines]);

  const addProductLine = (productId: string) => {
    const product = products.find((item) => item.id === productId);
    if (!product) {
      return;
    }
    const defaultSupplier = product.suppliers[0]?.id ?? "";
    setLines((current) => [
      ...current,
      {
        uid: crypto.randomUUID(),
        productId: product.id,
        supplierId: defaultSupplier,
        quantity: 1,
        unitPrice: product.retailPrice,
      },
    ]);
    setProductQuery("");
  };

  const updateLine = (uid: string, update: Partial<QuoteLine>) => {
    setLines((current) => current.map((line) => (line.uid === uid ? { ...line, ...update } : line)));
  };

  const removeLine = (uid: string) => {
    setLines((current) => current.filter((line) => line.uid !== uid));
  };

  const openQuoteModal = () => {
    setStep(1);
    setOpenModal(true);
  };

  const serializedItems = JSON.stringify(
    lines.map((line) => ({
      productId: line.productId,
      supplierId: line.supplierId || null,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
    })),
  );

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="inline-flex items-center gap-1 text-lg font-semibold tracking-tight text-slate-900 md:text-xl">
            <FileText className="h-4 w-4 text-slate-500" />
            <span>Cotizaciones</span>
          </h1>
          <p className="mt-1 text-xs text-slate-600">
            Crea cotizaciones modernas con cliente, multiples productos y proveedor por cada linea.
          </p>
        </div>
        <button
          type="button"
          onClick={openQuoteModal}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 text-sm font-medium text-white transition hover:bg-[var(--primary-strong)]"
        >
          <Plus className="h-4 w-4" />
          Nueva cotizacion
        </button>
      </div>

      <QuotesDataTable quotes={quotes} currency={currency} />

      {openModal ? (
        <div
          className="fixed inset-0 z-50 flex items-stretch justify-center bg-[#11182770] p-0 sm:items-start sm:p-4 md:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Nueva cotizacion"
          onClick={() => setOpenModal(false)}
        >
          <div
            className="h-full w-full max-w-6xl overflow-y-auto overflow-x-hidden rounded-none border border-[var(--line)] bg-white p-3 sm:max-h-[92vh] sm:rounded-xl sm:p-4 md:p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Nueva cotizacion</h2>
                <p className="text-xs text-slate-500">
                  Paso {step} de 2: {step === 1 ? "Cliente" : "Productos"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpenModal(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--line)] text-slate-600 transition hover:bg-slate-50"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form action={adminCreateQuoteAction} className="space-y-4">
              <input type="hidden" name="returnTo" value="/admin/cotizaciones" />
              <input type="hidden" name="items" value={serializedItems} />
              <input type="hidden" name="clientId" value={clientId} />

              {step === 1 ? (
                <div className="space-y-4 rounded-xl border border-[var(--line)] p-3">
                  <p className="text-sm font-semibold text-slate-900">Cliente</p>

                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="space-y-1.5">
                      <span className="text-sm font-medium text-slate-700">Buscar cliente existente</span>
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <Input
                          value={clientQuery}
                          onChange={(event) => setClientQuery(event.target.value)}
                          className="pl-9"
                          placeholder="Nombre o correo"
                        />
                      </div>
                    </label>

                    <div className="space-y-1.5">
                      <span className="text-sm font-medium text-slate-700">Seleccionar cliente</span>
                      <div className="flex items-center gap-2">
                        <select
                          value={clientId}
                          onChange={(event) => setClientId(event.target.value)}
                          className="field-select"
                          required
                        >
                          {filteredClients.map((client) => (
                            <option key={client.id} value={client.id}>
                              {client.name} - {client.email}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => setOpenClientModal(true)}
                          className="inline-flex h-10 items-center gap-1 rounded-lg border border-[var(--line)] bg-white px-3 text-sm text-slate-700 transition hover:bg-slate-50"
                        >
                          <UserPlus className="h-4 w-4" />
                          Nuevo
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-[var(--line)] bg-slate-50 px-3 py-2 text-sm text-slate-600">
                    {selectedClient ? (
                      <>
                        Cliente elegido: <span className="font-medium text-slate-800">{selectedClient.name}</span> (
                        {selectedClient.email})
                      </>
                    ) : (
                      "Selecciona un cliente para continuar."
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    disabled={!clientId}
                    className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-[var(--primary)] px-4 text-sm font-medium text-white transition hover:bg-[var(--primary-strong)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Siguiente
                  </button>
                </div>
              ) : (
                <>
                  <div className="rounded-lg border border-[var(--line)] bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    Cliente: <span className="font-medium text-slate-900">{selectedClient?.name ?? "No seleccionado"}</span>
                  </div>

                  <div className="grid gap-3 md:grid-cols-[1fr_240px]">
                    <label className="space-y-1.5">
                      <span className="text-sm font-medium text-slate-700">Notas</span>
                      <textarea
                        name="notes"
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                        rows={3}
                        className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-[var(--line-strong)]"
                        placeholder="Condiciones, tiempos y observaciones de la cotizacion"
                      />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-sm font-medium text-slate-700">Valida hasta (opcional)</span>
                      <Input
                        name="validUntil"
                        type="date"
                        value={validUntil}
                        onChange={(event) => setValidUntil(event.target.value)}
                      />
                    </label>
                  </div>

                  <div className="space-y-2 rounded-xl border border-[var(--line)] p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-900">Productos</p>
                    </div>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        value={productQuery}
                        onChange={(event) => setProductQuery(event.target.value)}
                        className="pl-9"
                        placeholder="Buscar producto para agregar"
                      />
                    </div>
                    {productQuery ? (
                      <div className="max-h-48 overflow-y-auto rounded-lg border border-[var(--line)] bg-white">
                        {filteredProducts.map((product) => (
                          <button
                            key={product.id}
                            type="button"
                            onClick={() => addProductLine(product.id)}
                            className="flex w-full items-center justify-between border-b border-[var(--line)] px-3 py-2 text-left text-sm transition hover:bg-slate-50 last:border-b-0"
                          >
                            <span className="font-medium text-slate-800">{product.name}</span>
                            <span className="text-xs text-slate-500">{product.code ?? "Sin codigo"}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}

                    <div className="space-y-2">
                      {linesWithMeta.length === 0 ? (
                        <p className="text-xs text-slate-500">Agrega uno o mas productos para armar la cotizacion.</p>
                      ) : (
                        linesWithMeta.map(({ line, product }) => (
                          <div
                            key={line.uid}
                            className="grid gap-2 rounded-lg border border-[var(--line)] p-2 md:grid-cols-[1.3fr_1fr_90px_120px_auto]"
                          >
                            <div className="text-sm">
                              <p className="font-medium text-slate-900">{product?.name ?? "Producto"}</p>
                              <p className="text-xs text-slate-500">{product?.code ?? "Sin codigo"}</p>
                            </div>
                            <select
                              value={line.supplierId}
                              onChange={(event) => updateLine(line.uid, { supplierId: event.target.value })}
                              className="h-9 rounded-lg border border-[var(--line)] bg-white px-2 text-xs text-slate-700 outline-none"
                            >
                              <option value="">Sin proveedor</option>
                              {(product?.suppliers ?? []).map((supplier) => (
                                <option key={supplier.id} value={supplier.id}>
                                  {supplier.name}
                                </option>
                              ))}
                            </select>
                            <Input
                              type="number"
                              min={1}
                              value={line.quantity}
                              onChange={(event) => updateLine(line.uid, { quantity: Number(event.target.value || 1) })}
                            />
                            <Input
                              type="number"
                              step="0.01"
                              min={0.01}
                              value={line.unitPrice}
                              onChange={(event) => updateLine(line.uid, { unitPrice: Number(event.target.value || 0) })}
                            />
                            <button
                              type="button"
                              onClick={() => removeLine(line.uid)}
                              className="inline-flex h-9 items-center justify-center rounded-lg border border-red-200 bg-white px-2 text-xs font-medium text-red-700 transition hover:bg-red-50"
                            >
                              Quitar
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-[var(--line)] bg-slate-50 px-3 py-2">
                    <span className="text-sm font-medium text-slate-700">Total cotizacion</span>
                    <span className="text-lg font-semibold text-[var(--primary-strong)]">
                      {quoteTotal.toLocaleString("es-CO", {
                        style: "currency",
                        currency,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="inline-flex h-10 items-center justify-center rounded-lg border border-[var(--line)] bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                      Atras
                    </button>
                    <button
                      type="submit"
                      className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-[var(--primary)] px-4 text-sm font-medium text-white transition hover:bg-[var(--primary-strong)] sm:w-auto"
                      disabled={!clientId || lines.length === 0}
                    >
                      Crear cotizacion
                    </button>
                  </div>
                </>
              )}
            </form>
          </div>
        </div>
      ) : null}

      {openClientModal ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-[#11182752] px-4"
          role="dialog"
          aria-modal="true"
          aria-label="Nuevo cliente"
          onClick={() => setOpenClientModal(false)}
        >
          <div className="saas-card w-full max-w-2xl rounded-xl p-5" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Nuevo cliente</h3>
              <button
                type="button"
                onClick={() => setOpenClientModal(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--line)] text-slate-600 transition hover:bg-slate-50"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form action={adminCreateClientQuickAction} className="space-y-3">
              <input type="hidden" name="returnTo" value="/admin/cotizaciones" />

              <div className="grid gap-3 md:grid-cols-2">
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-slate-700">Nombre y apellido</span>
                  <Input name="name" placeholder="Ej: Ana Perez" required />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-slate-700">Nit o cedula</span>
                  <Input name="document" placeholder="Ej: 123456789" required />
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-slate-700">Correo Electronico</span>
                  <Input name="email" type="email" placeholder="cliente@correo.com" required />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-slate-700">Telefono</span>
                  <Input name="phone" placeholder="Ej: 3001234567" required />
                </label>
              </div>

              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-700">Direccion</span>
                <Input name="address" placeholder="Calle 00 # 00 - 00" required />
              </label>

              <div className="grid gap-3 md:grid-cols-3">
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-slate-700">Barrio</span>
                  <Input name="neighborhood" placeholder="Barrio" required />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-slate-700">Departamento</span>
                  <Input name="department" placeholder="Departamento" required />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-slate-700">Ciudad</span>
                  <Input name="city" placeholder="Ciudad" required />
                </label>
              </div>

              <button
                type="submit"
                className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-[var(--primary)] px-4 text-sm font-medium text-white transition hover:bg-[var(--primary-strong)]"
              >
                Guardar cliente
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
