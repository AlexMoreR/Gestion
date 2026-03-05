"use client";

import { useMemo, useState, useTransition } from "react";
import { Boxes, FileText, Link2, Plus, Search, UserRound, X } from "lucide-react";
import { adminCreateQuoteAction, adminResolveClientAction } from "@/app/actions/quote-actions";
import { QuotesDataTable } from "@/components/admin/quotes-data-table";
import { Input } from "@/components/ui/input";
import type { SupportedCurrencyCode } from "@/lib/currency";

type ClientOption = {
  id: string;
  name: string;
  email: string;
  document: string;
  phone: string;
  address: string;
  neighborhood: string;
  department: string;
  city: string;
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
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [showClientResults, setShowClientResults] = useState(false);
  const [clientId, setClientId] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientDocument, setClientDocument] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [clientNeighborhood, setClientNeighborhood] = useState("");
  const [clientDepartment, setClientDepartment] = useState("");
  const [clientCity, setClientCity] = useState("");
  const [clientFormError, setClientFormError] = useState("");
  const [notes, setNotes] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [lines, setLines] = useState<QuoteLine[]>([]);
  const [isResolvingClient, startResolvingClient] = useTransition();

  const filteredClients = useMemo(() => {
    const q = clientName.trim().toLowerCase();
    if (!q) {
      return clients.slice(0, 8);
    }
    return clients
      .filter((client) =>
        `${client.name} ${client.email} ${client.document} ${client.phone}`.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [clients, clientName]);

  const selectedClient = useMemo(() => clients.find((client) => client.id === clientId), [clients, clientId]);

  const getClientDisplayName = (client: ClientOption): string => {
    const byExactEmail = client.name.replace(client.email, "").trim();
    if (byExactEmail) {
      return byExactEmail;
    }
    const byRegex = client.name.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "").trim();
    return byRegex || client.name;
  };

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

  const isClientDraftComplete = useMemo(
    () =>
      Boolean(
        clientName.trim() &&
          clientDocument.trim() &&
          clientEmail.trim() &&
          clientPhone.trim() &&
          clientAddress.trim() &&
          clientNeighborhood.trim() &&
          clientDepartment.trim() &&
          clientCity.trim(),
      ),
    [
      clientAddress,
      clientCity,
      clientDepartment,
      clientDocument,
      clientEmail,
      clientName,
      clientNeighborhood,
      clientPhone,
    ],
  );

  const isClientResolved = Boolean(clientId) || isClientDraftComplete;

  const handleClientInputChange = (setter: (value: string) => void, value: string) => {
    setter(value);
    if (clientId) {
      setClientId("");
    }
    if (clientFormError) {
      setClientFormError("");
    }
  };

  const applyClientSelection = (client: ClientOption) => {
    const displayName = getClientDisplayName(client);
    setClientId(client.id);
    setClientName(displayName);
    setClientDocument(client.document);
    setClientEmail(client.email);
    setClientPhone(client.phone);
    setClientAddress(client.address);
    setClientNeighborhood(client.neighborhood);
    setClientDepartment(client.department);
    setClientCity(client.city);
    setShowClientResults(false);
    setClientFormError("");
  };

  const goToProductsStep = () => {
    if (clientId) {
      setClientFormError("");
      setStep(2);
      return;
    }

    if (!isClientDraftComplete) {
      setClientFormError("Selecciona un cliente del buscador o completa todos los campos.");
      return;
    }

    startResolvingClient(async () => {
      const result = await adminResolveClientAction({
        name: clientName,
        document: clientDocument,
        email: clientEmail,
        phone: clientPhone,
        address: clientAddress,
        neighborhood: clientNeighborhood,
        department: clientDepartment,
        city: clientCity,
      });

      if (!result.ok) {
        setClientFormError(result.error);
        return;
      }

      setClientId(result.clientId);
      setClientFormError("");
      setStep(2);
    });
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
                <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-slate-900">
                  <FileText className="h-4 w-4 text-slate-500" />
                  <span>Nueva cotizacion</span>
                </h2>
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
              <input type="hidden" name="name" value={clientName} />
              <input type="hidden" name="document" value={clientDocument} />
              <input type="hidden" name="email" value={clientEmail} />
              <input type="hidden" name="phone" value={clientPhone} />
              <input type="hidden" name="address" value={clientAddress} />
              <input type="hidden" name="neighborhood" value={clientNeighborhood} />
              <input type="hidden" name="department" value={clientDepartment} />
              <input type="hidden" name="city" value={clientCity} />

              <div className="rounded-xl border border-[var(--line)] bg-slate-50/80 p-3">
                <div className="flex items-center gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <div
                      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition ${
                        step === 1
                          ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                          : "border-emerald-200 bg-emerald-50 text-emerald-700"
                      } ${step === 1 ? "stepper-icon-zoom" : ""}`}
                    >
                      <UserRound className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className={`text-xs font-semibold ${step === 1 ? "text-slate-900" : "text-slate-600"}`}>Cliente</p>
                    </div>
                  </div>

                  <div className="h-px flex-1 bg-[var(--line)]">
                    <div
                      className={`h-full transition ${step >= 2 ? "w-full bg-[var(--primary)]" : "w-0 bg-[var(--primary)]"}`}
                    />
                  </div>

                  <div className="flex min-w-0 items-center gap-2">
                    <div
                      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition ${
                        step === 2
                          ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                          : step > 2
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-[var(--line)] bg-white text-slate-500"
                      } ${step === 2 ? "stepper-icon-zoom" : ""}`}
                    >
                      <Boxes className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className={`text-xs font-semibold ${step === 2 ? "text-slate-900" : "text-slate-600"}`}>Productos</p>
                    </div>
                  </div>

                  <div className="h-px flex-1 bg-[var(--line)]">
                    <div
                      className={`h-full transition ${step >= 3 ? "w-full bg-[var(--primary)]" : "w-0 bg-[var(--primary)]"}`}
                    />
                  </div>

                  <div className="flex min-w-0 items-center gap-2">
                    <div
                      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition ${
                        step === 3
                          ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                          : "border-[var(--line)] bg-white text-slate-500"
                      } ${step === 3 ? "stepper-icon-zoom" : ""}`}
                    >
                      <Link2 className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className={`text-xs font-semibold ${step === 3 ? "text-slate-900" : "text-slate-600"}`}>Generar</p>
                    </div>
                  </div>
                </div>
              </div>

              {step === 1 ? (
                <div className="space-y-4 rounded-xl border border-[var(--line)] p-3">
                  <div className="space-y-3 rounded-lg border border-[var(--line)] p-3">
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="relative block space-y-1.5">
                        <span className="text-sm font-medium text-slate-700">Nombre y apellido</span>
                        <Input
                          value={clientName}
                          onChange={(event) => handleClientInputChange(setClientName, event.target.value)}
                          onFocus={() => setShowClientResults(true)}
                          onBlur={() => {
                            setTimeout(() => setShowClientResults(false), 120);
                          }}
                          placeholder="Ej: Ana Perez"
                        />

                        {showClientResults ? (
                          <div className="absolute left-0 right-0 top-full z-30 mt-1.5 overflow-hidden rounded-lg border border-[var(--line)] bg-white shadow-lg">
                            <p className="px-3 py-2 text-xs text-slate-500">Clientes</p>
                            <div className="max-h-52 overflow-y-auto p-1.5">
                              {filteredClients.length > 0 ? (
                                filteredClients.map((client) => (
                                  <button
                                    key={client.id}
                                    type="button"
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() => applyClientSelection(client)}
                                    className="flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-sm transition hover:bg-slate-100"
                                  >
                                    <span className="inline-flex items-center gap-2 text-slate-800">
                                      <UserRound className="h-3.5 w-3.5 text-slate-500" />
                                      {getClientDisplayName(client)}
                                    </span>
                                    <span className="text-xs text-slate-500">{client.phone || "Sin telefono"}</span>
                                  </button>
                                ))
                              ) : (
                                <p className="px-2.5 py-2 text-xs text-slate-500">Sin resultados. Completa los campos para crear cliente.</p>
                              )}
                            </div>
                          </div>
                        ) : null}
                      </label>
                      <label className="block space-y-1.5">
                        <span className="text-sm font-medium text-slate-700">Nit o cedula</span>
                        <Input
                          value={clientDocument}
                          onChange={(event) => handleClientInputChange(setClientDocument, event.target.value)}
                          placeholder="Ej: 123456789"
                        />
                      </label>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="block space-y-1.5">
                        <span className="text-sm font-medium text-slate-700">Correo Electronico</span>
                        <Input
                          type="email"
                          value={clientEmail}
                          onChange={(event) => handleClientInputChange(setClientEmail, event.target.value)}
                          placeholder="cliente@correo.com"
                        />
                      </label>
                      <label className="block space-y-1.5">
                        <span className="text-sm font-medium text-slate-700">Telefono</span>
                        <Input
                          value={clientPhone}
                          onChange={(event) => handleClientInputChange(setClientPhone, event.target.value)}
                          placeholder="Ej: 3001234567"
                        />
                      </label>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="block space-y-1.5">
                        <span className="text-sm font-medium text-slate-700">Direccion</span>
                        <Input
                          value={clientAddress}
                          onChange={(event) => handleClientInputChange(setClientAddress, event.target.value)}
                          placeholder="Calle 00 # 00 - 00"
                        />
                      </label>
                      <label className="block space-y-1.5">
                        <span className="text-sm font-medium text-slate-700">Barrio</span>
                        <Input
                          value={clientNeighborhood}
                          onChange={(event) => handleClientInputChange(setClientNeighborhood, event.target.value)}
                          placeholder="Barrio"
                        />
                      </label>
                      <label className="block space-y-1.5">
                        <span className="text-sm font-medium text-slate-700">Departamento</span>
                        <Input
                          value={clientDepartment}
                          onChange={(event) => handleClientInputChange(setClientDepartment, event.target.value)}
                          placeholder="Departamento"
                        />
                      </label>
                      <label className="block space-y-1.5">
                        <span className="text-sm font-medium text-slate-700">Ciudad</span>
                        <Input
                          value={clientCity}
                          onChange={(event) => handleClientInputChange(setClientCity, event.target.value)}
                          placeholder="Ciudad"
                        />
                      </label>
                    </div>
                  </div>

                  {clientFormError ? <p className="text-xs font-medium text-red-600">{clientFormError}</p> : null}

                  <button
                    type="button"
                    onClick={goToProductsStep}
                    disabled={!isClientResolved || isResolvingClient}
                    className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-[var(--primary)] px-4 text-sm font-medium text-white transition hover:bg-[var(--primary-strong)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isResolvingClient ? "Guardando cliente..." : "Siguiente"}
                  </button>
                </div>
              ) : step === 2 ? (
                <>
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
                      type="button"
                      onClick={() => setStep(3)}
                      className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-[var(--primary)] px-4 text-sm font-medium text-white transition hover:bg-[var(--primary-strong)] sm:w-auto"
                      disabled={lines.length === 0}
                    >
                      Siguiente
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="rounded-lg border border-[var(--line)] bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    Revisa los datos y genera la cotizacion para obtener el link compartible.
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm">
                      <p className="text-xs font-medium text-slate-500">Cliente</p>
                      <p className="font-semibold text-slate-900">
                        {clientId ? selectedClient?.name ?? clientName : clientName}
                      </p>
                      <p className="text-slate-600">{clientEmail}</p>
                    </div>
                    <div className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm">
                      <p className="text-xs font-medium text-slate-500">Valida hasta</p>
                      <p className="font-semibold text-slate-900">{validUntil || "Sin fecha de vencimiento"}</p>
                      <p className="text-slate-600">{lines.length} linea(s) de producto</p>
                    </div>
                  </div>

                  <div className="space-y-2 rounded-xl border border-[var(--line)] p-3">
                    <p className="text-sm font-semibold text-slate-900">Resumen de productos</p>
                    {linesWithMeta.length === 0 ? (
                      <p className="text-xs text-slate-500">No hay productos agregados.</p>
                    ) : (
                      linesWithMeta.map(({ line, product }) => (
                        <div key={line.uid} className="flex items-center justify-between rounded-lg border border-[var(--line)] px-3 py-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-slate-900">{product?.name ?? "Producto"}</p>
                            <p className="text-xs text-slate-500">
                              Cantidad: {line.quantity} x {line.unitPrice.toLocaleString("es-CO", { style: "currency", currency })}
                            </p>
                          </div>
                          <p className="text-sm font-semibold text-slate-900">
                            {(line.quantity * line.unitPrice).toLocaleString("es-CO", { style: "currency", currency })}
                          </p>
                        </div>
                      ))
                    )}
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
                      onClick={() => setStep(2)}
                      className="inline-flex h-10 items-center justify-center rounded-lg border border-[var(--line)] bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                      Atras
                    </button>
                    <button
                      type="submit"
                      className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-[var(--primary)] px-4 text-sm font-medium text-white transition hover:bg-[var(--primary-strong)] sm:w-auto"
                      disabled={!isClientResolved || lines.length === 0}
                    >
                      Generar cotizacion
                    </button>
                  </div>
                </>
              )}
            </form>
          </div>
        </div>
      ) : null}

    </>
  );
}
