"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  AlignLeft,
  Boxes,
  Coins,
  FileText,
  ImagePlus,
  Link2,
  Loader2,
  Palette,
  Percent,
  Plus,
  RefreshCw,
  Search,
  StickyNote,
  Trash2,
  Truck,
  UserRound,
  X,
} from "lucide-react";
import {
  adminCreateQuoteAction,
  adminResolveClientAction,
  adminUpdateQuoteFullAction,
  adminUploadQuoteImageAction,
} from "@/app/actions/quote-actions";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ProductThumb } from "@/components/admin/product-thumb";
import { expandComboLines, type ComboComponent } from "@/lib/combo";
import type { SupportedCurrencyCode } from "@/lib/currency";
import { calculateQuoteLineTotal } from "@/lib/quote-item-meta";
import { Button } from "../ui/button";

export type QuoteWizardClient = {
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

export type QuoteWizardProduct = {
  id: string;
  name: string;
  code: string | null;
  stock: number;
  retailPrice: number;
  wholesalePrice: number;
  minWholesaleQty: number;
  thumbnailUrl?: string | null;
  suppliers: ProductSupplierOption[];
  isBundle?: boolean;
  components?: ComboComponent[];
};

type FulfillmentMode = "STOCK" | "MANUFACTURE";

export type QuoteStatus = "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED";

type QuoteLine = {
  uid: string;
  productId: string;
  quantity: number;
  color: string;
  unitPrice: number;
  description: string;
  additionalCost: number;
  discount: number;
  fulfillmentMode: FulfillmentMode;
  imageUrl: string;
  // Agrupacion de combo (vacio = producto suelto). Las lineas con el mismo
  // comboKey son componentes del mismo combo y se muestran como una sola fila.
  comboKey: string;
  comboName: string;
  comboCode: string;
  comboQuantity: number;
};

export type QuoteWizardInitialLine = {
  productId: string;
  quantity: number;
  unitPrice: number;
  description: string;
  color: string;
  additionalCost: number;
  discount: number;
  fulfillmentMode: FulfillmentMode;
  imageUrl: string;
  comboKey?: string;
  comboName?: string;
  comboCode?: string;
  comboQuantity?: number;
};

type QuoteWizardModalProps = {
  open: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  currency: SupportedCurrencyCode;
  clients: QuoteWizardClient[];
  products: QuoteWizardProduct[];
  returnTo: string;
  // edit-only
  quoteId?: string;
  quoteCode?: string;
  initialClient?: QuoteWizardClient | null;
  initialLines?: QuoteWizardInitialLine[];
  initialCreatedAt?: string;
  initialStatus?: QuoteStatus;
  initialValidUntil?: string;
  initialNotes?: string;
};

const todayLocal = () =>
  new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

// Reparte un monto (descuento o costo adicional del combo) entre las lineas en
// proporcion a su peso. El ultimo elemento absorbe el redondeo para que la suma
// sea exacta. Asi ninguna linea concentra todo el descuento (evita el recorte a
// 0) y el desglose Subtotal/Descuento/Adicional cuadra con el Total.
function distributeAmount(amount: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  const totalWeight = weights.reduce((sum, w) => sum + Math.max(0, w), 0);
  let allocated = 0;
  return weights.map((w, index) => {
    if (index === weights.length - 1) {
      return Math.round(amount - allocated);
    }
    const part =
      totalWeight > 0
        ? Math.round((amount * Math.max(0, w)) / totalWeight)
        : Math.round(amount / weights.length);
    allocated += part;
    return part;
  });
}

// Badge del tipo de cumplimiento (solo lectura) para la revision.
function FulfillmentBadge({ mode }: { mode: FulfillmentMode; canStock?: boolean }) {
  const isStock = mode === "STOCK";
  const label = isStock ? "Stock" : "Fabricacion";
  const tone = isStock
    ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
    : "border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-400";

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${tone}`}>
      {label}
    </span>
  );
}

export function QuoteWizardModal({
  open,
  onClose,
  mode,
  currency,
  clients,
  products,
  returnTo,
  quoteId = "",
  quoteCode = "",
  initialClient = null,
  initialLines = [],
  initialCreatedAt,
  initialStatus = "DRAFT",
  initialValidUntil = "",
  initialNotes = "",
}: QuoteWizardModalProps) {
  const isEdit = mode === "edit";

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [showClientResults, setShowClientResults] = useState(false);
  // Muestra el formulario de cliente (al pulsar "Agregar cliente").
  const [showClientForm, setShowClientForm] = useState(false);
  const [clientId, setClientId] = useState(initialClient?.id ?? "");
  const [clientName, setClientName] = useState(initialClient?.name ?? "");
  const [clientDocument, setClientDocument] = useState(initialClient?.document ?? "");
  const [clientEmail, setClientEmail] = useState(initialClient?.email ?? "");
  const [clientPhone, setClientPhone] = useState(initialClient?.phone ?? "");
  const [clientAddress, setClientAddress] = useState(initialClient?.address ?? "");
  const [clientNeighborhood, setClientNeighborhood] = useState(initialClient?.neighborhood ?? "");
  const [clientDepartment, setClientDepartment] = useState(initialClient?.department ?? "");
  const [clientCity, setClientCity] = useState(initialClient?.city ?? "");
  const [clientFormError, setClientFormError] = useState("");
  const [createdAt, setCreatedAt] = useState(initialCreatedAt || todayLocal());
  const [status, setStatus] = useState<QuoteStatus>(initialStatus);
  const [validUntil, setValidUntil] = useState(initialValidUntil);
  const [notes, setNotes] = useState(initialNotes);
  const [lines, setLines] = useState<QuoteLine[]>(
    initialLines.map((item) => ({
      uid: crypto.randomUUID(),
      productId: item.productId,
      quantity: item.quantity,
      color: item.color,
      unitPrice: item.unitPrice,
      description: item.description,
      additionalCost: item.additionalCost,
      discount: item.discount,
      fulfillmentMode: item.fulfillmentMode,
      imageUrl: item.imageUrl,
      comboKey: item.comboKey ?? "",
      comboName: item.comboName ?? "",
      comboCode: item.comboCode ?? "",
      comboQuantity: item.comboQuantity ?? 0,
    })),
  );
  const [isResolvingClient, startResolvingClient] = useTransition();

  const [openProductModal, setOpenProductModal] = useState(false);
  const [productLookup, setProductLookup] = useState("");
  const [draftProductId, setDraftProductId] = useState("");
  const [draftQuantity, setDraftQuantity] = useState("1");
  const [draftColor, setDraftColor] = useState("");
  const [draftUnitPrice, setDraftUnitPrice] = useState("");
  // Modo mayorista a nivel de cotizacion: usa el wholesalePrice de cada producto.
  const [wholesaleMode, setWholesaleMode] = useState(false);
  const [draftDescription, setDraftDescription] = useState("");
  const [draftAdditionalCost, setDraftAdditionalCost] = useState("0");
  const [draftDiscount, setDraftDiscount] = useState("0");
  const [draftFulfillmentMode, setDraftFulfillmentMode] = useState<FulfillmentMode>("STOCK");
  const [draftImageUrl, setDraftImageUrl] = useState("");
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [productFormError, setProductFormError] = useState("");
  const [isManualQuoteSubmit, setIsManualQuoteSubmit] = useState(false);

  // Al abrir, arrancamos siempre en el paso 1 (Productos). El cliente ya viene
  // precargado en edicion, asi que no mostramos el formulario expandido.
  useEffect(() => {
    if (open) {
      setStep(1);
      setShowClientForm(false);
    }
  }, [open]);

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

  const getClientDisplayName = (client: QuoteWizardClient): string => {
    const byExactEmail = client.name.replace(client.email, "").trim();
    if (byExactEmail) {
      return byExactEmail;
    }
    const byRegex = client.name.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "").trim();
    return byRegex || client.name;
  };

  const filteredProducts = useMemo(() => {
    const q = productLookup.trim().toLowerCase();
    if (!q) {
      return products.slice(0, 24);
    }
    return products
      .filter((product) => `${product.code ?? ""} ${product.name}`.toLowerCase().includes(q))
      .slice(0, 24);
  }, [products, productLookup]);

  const draftProduct = useMemo(
    () => products.find((product) => product.id === draftProductId) ?? null,
    [products, draftProductId],
  );

  const linesWithMeta = useMemo(
    () =>
      lines.map((line) => {
        const product = products.find((item) => item.id === line.productId);
        return {
          line,
          product,
          lineTotal: calculateQuoteLineTotal(line.quantity, line.unitPrice, line.additionalCost, line.discount),
        };
      }),
    [lines, products],
  );

  const quoteTotal = useMemo(
    () =>
      lines.reduce(
        (sum, line) => sum + calculateQuoteLineTotal(line.quantity, line.unitPrice, line.additionalCost, line.discount),
        0,
      ),
    [lines],
  );

  // Agrupa para la tabla: un combo se muestra como UNA sola fila (con el nombre
  // y codigo del combo); los productos sueltos quedan como una fila normal.
  type LineWithMeta = (typeof linesWithMeta)[number];
  type LineGroup =
    | { type: "single"; key: string; item: LineWithMeta }
    | {
        type: "combo";
        key: string;
        comboName: string;
        comboCode: string;
        comboQuantity: number;
        fulfillmentMode: FulfillmentMode;
        color: string;
        description: string;
        thumbnailUrl: string;
        total: number;
      };
  const groupedLines = useMemo<LineGroup[]>(() => {
    const groups: LineGroup[] = [];
    const indexByCombo = new Map<string, number>();
    for (const item of linesWithMeta) {
      const ck = item.line.comboKey;
      if (!ck) {
        groups.push({ type: "single", key: item.line.uid, item });
        continue;
      }
      const existing = indexByCombo.get(ck);
      if (existing !== undefined) {
        const group = groups[existing];
        if (group.type === "combo") {
          group.total += item.lineTotal;
        }
      } else {
        indexByCombo.set(ck, groups.length);
        groups.push({
          type: "combo",
          key: ck,
          comboName: item.line.comboName || "Combo",
          comboCode: item.line.comboCode,
          comboQuantity: item.line.comboQuantity || 1,
          fulfillmentMode: item.line.fulfillmentMode,
          color: item.line.color,
          description: item.line.description,
          thumbnailUrl: item.line.imageUrl || item.product?.thumbnailUrl || "",
          total: item.lineTotal,
        });
      }
    }
    return groups;
  }, [linesWithMeta]);

  const quoteSubtotal = useMemo(
    () => lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0),
    [lines],
  );

  const quoteDiscountTotal = useMemo(
    () => lines.reduce((sum, line) => sum + line.discount, 0),
    [lines],
  );

  const quoteAdditionalCostTotal = useMemo(
    () => lines.reduce((sum, line) => sum + line.additionalCost, 0),
    [lines],
  );

  const removeLine = (uid: string) => {
    setLines((current) => current.filter((line) => line.uid !== uid));
  };

  // Quita de una vez todas las lineas (componentes) de un combo.
  const removeCombo = (comboKey: string) => {
    setLines((current) => current.filter((line) => line.comboKey !== comboKey));
  };

  const resetDraftProduct = () => {
    setDraftProductId("");
    setProductLookup("");
    setDraftQuantity("1");
    setDraftColor("");
    setDraftUnitPrice("");
    setDraftDescription("");
    setDraftAdditionalCost("0");
    setDraftDiscount("0");
    setDraftFulfillmentMode("STOCK");
    setDraftImageUrl("");
    setIsUploadingImage(false);
    setProductFormError("");
  };

  const openAddProductModal = () => {
    resetDraftProduct();
    setOpenProductModal(true);
  };

  const priceForMode = (product: QuoteWizardProduct, wholesale: boolean): number =>
    wholesale && product.wholesalePrice > 0 ? product.wholesalePrice : product.retailPrice;

  const applyProductSelection = (product: QuoteWizardProduct) => {
    setDraftProductId(product.id);
    setProductLookup(product.code || product.name);
    // En modo mayorista usa el wholesalePrice (si el producto lo tiene configurado).
    setDraftUnitPrice(String(priceForMode(product, wholesaleMode)));
    // Sin stock -> por orden (se fabrica); con stock -> por existencias.
    setDraftFulfillmentMode(product.stock > 0 ? "STOCK" : "MANUFACTURE");
    setProductFormError("");
  };

  // Cambia el modo mayorista y re-precia las lineas sueltas (los combos conservan
  // el precio configurado por componente).
  const applyWholesaleMode = (next: boolean) => {
    setWholesaleMode(next);
    setLines((current) =>
      current.map((line) => {
        if (line.comboKey) return line;
        const product = products.find((item) => item.id === line.productId);
        if (!product) return line;
        return { ...line, unitPrice: priceForMode(product, next) };
      }),
    );
  };

  const clearDraftProductSelection = () => {
    setDraftProductId("");
    setProductLookup("");
    setDraftUnitPrice("");
    setDraftImageUrl("");
    setProductFormError("");
  };

  const handleImageUpload = async (file: File | undefined) => {
    if (!file) {
      return;
    }
    if (!file.type.startsWith("image/")) {
      setProductFormError("Solo se permiten archivos de imagen.");
      return;
    }

    setIsUploadingImage(true);
    setProductFormError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await adminUploadQuoteImageAction(formData);
      if (!result.ok) {
        setProductFormError(result.error);
        return;
      }
      setDraftImageUrl(result.url);
    } catch {
      setProductFormError("No se pudo subir la imagen.");
    } finally {
      setIsUploadingImage(false);
    }
  };

  const addDraftProduct = () => {
    if (!draftProductId) {
      setProductFormError("Selecciona un producto por codigo.");
      return;
    }

    const quantity = Number(draftQuantity || 0);
    const unitPrice = Number(draftUnitPrice || 0);
    const additionalCost = Number(draftAdditionalCost || 0);
    const discount = Number(draftDiscount || 0);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setProductFormError("La cantidad debe ser mayor a 0.");
      return;
    }

    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      setProductFormError("El precio debe ser mayor a 0.");
      return;
    }

    if (!Number.isFinite(additionalCost) || additionalCost < 0) {
      setProductFormError("El costo adicional no puede ser negativo.");
      return;
    }

    if (!Number.isFinite(discount) || discount < 0) {
      setProductFormError("El descuento no puede ser negativo.");
      return;
    }

    // Si es un combo, se separa en sus componentes (cada uno conserva su
    // producto real y su proveedor); el precio del combo se reparte entre las
    // lineas. El descuento y costo adicional del combo se REPARTEN entre las
    // lineas (proporcional a su valor) para que ninguna linea quede recortada a
    // 0 y el desglose cuadre con el total.
    if (draftProduct?.isBundle && draftProduct.components && draftProduct.components.length > 0) {
      const expanded = expandComboLines(draftProduct.components, quantity, unitPrice);
      const weights = expanded.map((line) => line.quantity * line.unitPrice);
      const discountParts = distributeAmount(discount, weights);
      const additionalParts = distributeAmount(additionalCost, weights);
      // Todas las lineas del combo comparten un comboKey para mostrarse como una
      // sola fila (con el nombre y codigo del combo).
      const comboKey = crypto.randomUUID();
      const comboName = draftProduct.name;
      const comboCode = draftProduct.code ?? "";
      setLines((current) => [
        ...current,
        ...expanded.map((line, index) => ({
          uid: crypto.randomUUID(),
          productId: line.productId,
          quantity: line.quantity,
          color: draftColor.trim(),
          unitPrice: line.unitPrice,
          description: draftDescription.trim(),
          additionalCost: Math.max(0, additionalParts[index] ?? 0),
          discount: Math.max(0, discountParts[index] ?? 0),
          fulfillmentMode: draftFulfillmentMode,
          imageUrl: draftImageUrl.trim(),
          comboKey,
          comboName,
          comboCode,
          comboQuantity: quantity,
        })),
      ]);

      setOpenProductModal(false);
      resetDraftProduct();
      return;
    }

    setLines((current) => [
      ...current,
      {
        uid: crypto.randomUUID(),
        productId: draftProductId,
        quantity,
        color: draftColor.trim(),
        unitPrice,
        description: draftDescription.trim(),
        additionalCost,
        discount,
        fulfillmentMode: draftFulfillmentMode,
        imageUrl: draftImageUrl.trim(),
        comboKey: "",
        comboName: "",
        comboCode: "",
        comboQuantity: 0,
      },
    ]);

    setOpenProductModal(false);
    resetDraftProduct();
  };

  const draftLineTotal = useMemo(() => {
    const quantity = Number(draftQuantity || 0);
    const unitPrice = Number(draftUnitPrice || 0);
    const additionalCost = Number(draftAdditionalCost || 0);
    const discount = Number(draftDiscount || 0);
    if (
      !Number.isFinite(quantity) ||
      !Number.isFinite(unitPrice) ||
      !Number.isFinite(additionalCost) ||
      !Number.isFinite(discount)
    ) {
      return 0;
    }
    return calculateQuoteLineTotal(quantity, unitPrice, additionalCost, discount);
  }, [draftAdditionalCost, draftDiscount, draftQuantity, draftUnitPrice]);

  const isClientDraftComplete = useMemo(
    () =>
      Boolean(
        clientName.trim() &&
        clientPhone.trim() &&
        clientAddress.trim() &&
        clientCity.trim(),
      ),
    [clientAddress, clientCity, clientName, clientPhone],
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

  const applyClientSelection = (client: QuoteWizardClient) => {
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

  const goToReviewStep = () => {
    if (clientId) {
      setClientFormError("");
      setStep(3);
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
      setStep(3);
    });
  };

  const serializedItems = JSON.stringify(
    lines.map((line) => ({
      productId: line.productId,
      supplierId: null,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      fulfillmentMode: line.fulfillmentMode,
      color: line.color || null,
      additionalCost: line.additionalCost,
      discount: line.discount,
      notes: line.description || null,
      imageUrl: line.imageUrl || null,
      comboKey: line.comboKey || null,
      comboName: line.comboName || null,
      comboCode: line.comboCode || null,
      comboQuantity: line.comboQuantity || null,
    })),
  );

  if (!open) {
    return null;
  }

  const action = isEdit ? adminUpdateQuoteFullAction : adminCreateQuoteAction;
  const title = isEdit ? `Editar cotizacion ${quoteCode}` : "Nueva cotizacion";
  const submitLabel = isEdit ? "Guardar cambios" : "Generar cotizacion";

  return (
    <>
      <div
        className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-black/50"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={onClose}
      >
        <div
          className="relative flex min-h-[100dvh] w-full max-w-6xl flex-col overflow-y-auto overflow-x-hidden rounded-none border border-border bg-card p-3 sm:mx-auto sm:min-h-0 sm:max-h-[92vh] sm:rounded-xl sm:p-4 md:p-5"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-foreground">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span>{title}</span>
              </h2>
              <label className="inline-flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground">Fecha</span>
                <DatePicker value={createdAt} onChange={setCreatedAt} />
              </label>
            </div>
            <Button type="button" variant="outline" size="icon" onClick={onClose} aria-label="Cerrar">
              <X className="h-4 w-4" />
            </Button>
          </div>

          <form
            action={action}
            className="space-y-4"
            onSubmit={(event) => {
              if (step !== 3 || !isManualQuoteSubmit) {
                event.preventDefault();
                return;
              }
              setIsManualQuoteSubmit(false);
            }}
          >
            <input type="hidden" name="returnTo" value={returnTo} />
            <input type="hidden" name="createdAt" value={createdAt} />
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
            {isEdit ? (
              <>
                <input type="hidden" name="quoteId" value={quoteId} />
                <input type="hidden" name="status" value={status} />
                <input type="hidden" name="validUntil" value={validUntil} />
                <input type="hidden" name="notes" value={notes} />
              </>
            ) : null}

            <div>
              <div className="grid gap-1.5 md:grid-cols-3">
                <div className={`rounded-lg border p-2 transition ${step >= 1 ? "border-[var(--primary)]/30 bg-[var(--primary)]/5" : "border-border bg-card"}`}>
                  <div className="flex items-center gap-2">
                    <div className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${step === 1 ? "border-[var(--primary)] bg-[var(--primary)] text-primary-foreground" : "border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"}`}>
                      <Boxes className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Paso 1</p>
                      <p className="text-xs font-semibold text-foreground">Productos</p>
                    </div>
                  </div>
                </div>

                <div className={`rounded-lg border p-2 transition ${step >= 2 ? "border-[var(--primary)]/30 bg-[var(--primary)]/5" : "border-border bg-card"}`}>
                  <div className="flex items-center gap-2">
                    <div className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${step === 2 ? "border-[var(--primary)] bg-[var(--primary)] text-primary-foreground" : step > 2 ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "border-border bg-card text-muted-foreground"}`}>
                      <UserRound className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Paso 2</p>
                      <p className="text-xs font-semibold text-foreground">Cliente</p>
                    </div>
                  </div>
                </div>

                <div className={`rounded-lg border p-2 transition ${step >= 3 ? "border-[var(--primary)]/30 bg-[var(--primary)]/5" : "border-border bg-card"}`}>
                  <div className="flex items-center gap-2">
                    <div className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${step === 3 ? "border-[var(--primary)] bg-[var(--primary)] text-primary-foreground" : "border-border bg-card text-muted-foreground"}`}>
                      <Link2 className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Paso 3</p>
                      <p className="text-xs font-semibold text-foreground">{isEdit ? "Finalizar" : "Generar"}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full bg-[var(--primary)] transition-all duration-300 ${step === 1 ? "w-1/3" : step === 2 ? "w-2/3" : "w-full"}`}
                />
              </div>
            </div>

            {step === 2 ? (
              <div className="space-y-4 rounded-xl border border-border p-3">
                {!showClientForm ? (
                  <div className="flex flex-col items-center gap-3 py-8 text-center">
                    <div className="rounded-full border border-border bg-muted p-2">
                      <UserRound className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {clientId ? `Cliente: ${clientName || "seleccionado"}` : "Aun no has agregado un cliente."}
                    </p>
                    <Button type="button" size="lg" onClick={() => setShowClientForm(true)}>
                      <UserRound className="h-4 w-4" />
                      {clientId ? "Editar cliente" : "Agregar cliente"}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="relative block space-y-1.5">
                        <span className="text-sm font-medium text-foreground">Nombre y apellido</span>
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
                          <div className="absolute left-0 right-0 top-full z-30 mt-1.5 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
                            <p className="px-3 py-2 text-xs text-muted-foreground">Clientes</p>
                            <div className="max-h-52 overflow-y-auto p-1.5">
                              {filteredClients.length > 0 ? (
                                filteredClients.map((client) => (
                                  <Button
                                    key={client.id}
                                    type="button"
                                    variant="ghost"
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() => applyClientSelection(client)}
                                    className="h-auto w-full justify-between px-2.5 py-2 text-left font-normal"
                                  >
                                    <span className="inline-flex items-center gap-2 text-foreground">
                                      <UserRound className="h-3.5 w-3.5 text-muted-foreground" />
                                      {getClientDisplayName(client)}
                                    </span>
                                    <span className="text-xs text-muted-foreground">{client.phone || "Sin telefono"}</span>
                                  </Button>
                                ))
                              ) : (
                                <p className="px-2.5 py-2 text-xs text-muted-foreground">Sin resultados. Completa los campos para crear cliente.</p>
                              )}
                            </div>
                          </div>
                        ) : null}
                      </label>
                      <label className="block space-y-1.5">
                        <span className="text-sm font-medium text-foreground">Nit o cedula <span className="text-muted-foreground">(opcional)</span></span>
                        <Input
                          value={clientDocument}
                          onChange={(event) => handleClientInputChange(setClientDocument, event.target.value)}
                          placeholder="Ej: 123456789"
                        />
                      </label>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="block space-y-1.5">
                        <span className="text-sm font-medium text-foreground">Correo Electronico <span className="text-muted-foreground">(opcional)</span></span>
                        <Input
                          type="email"
                          value={clientEmail}
                          onChange={(event) => handleClientInputChange(setClientEmail, event.target.value)}
                          placeholder="cliente@correo.com"
                        />
                      </label>
                      <label className="block space-y-1.5">
                        <span className="text-sm font-medium text-foreground">Telefono</span>
                        <Input
                          value={clientPhone}
                          onChange={(event) => handleClientInputChange(setClientPhone, event.target.value)}
                          placeholder="Ej: 3001234567"
                        />
                      </label>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="block space-y-1.5">
                        <span className="text-sm font-medium text-foreground">Direccion</span>
                        <Input
                          value={clientAddress}
                          onChange={(event) => handleClientInputChange(setClientAddress, event.target.value)}
                          placeholder="Calle 00 # 00 - 00"
                        />
                      </label>
                      <label className="block space-y-1.5">
                        <span className="text-sm font-medium text-foreground">Barrio <span className="text-muted-foreground">(opcional)</span></span>
                        <Input
                          value={clientNeighborhood}
                          onChange={(event) => handleClientInputChange(setClientNeighborhood, event.target.value)}
                          placeholder="Barrio"
                        />
                      </label>
                      <label className="block space-y-1.5">
                        <span className="text-sm font-medium text-foreground">Departamento <span className="text-muted-foreground">(opcional)</span></span>
                        <Input
                          value={clientDepartment}
                          onChange={(event) => handleClientInputChange(setClientDepartment, event.target.value)}
                          placeholder="Departamento"
                        />
                      </label>
                      <label className="block space-y-1.5">
                        <span className="text-sm font-medium text-foreground">Ciudad</span>
                        <Input
                          value={clientCity}
                          onChange={(event) => handleClientInputChange(setClientCity, event.target.value)}
                          placeholder="Ciudad"
                        />
                      </label>
                    </div>
                  </div>
                )}

                {clientFormError ? <p className="text-xs font-medium text-destructive">{clientFormError}</p> : null}

                <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
                  <Button type="button" variant="outline" size="lg" onClick={() => setStep(1)}>
                    Atras
                  </Button>
                  <Button
                    type="button"
                    size="lg"
                    onClick={goToReviewStep}
                    disabled={!isClientResolved || isResolvingClient}
                    className="w-full sm:w-auto"
                  >
                    {isResolvingClient ? "Guardando cliente..." : "Siguiente"}
                  </Button>
                </div>
              </div>
            ) : step === 1 ? (
              <div className="space-y-4">
                {/* Interruptor de precios al por mayor (afecta toda la cotizacion). */}
                <label className="flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[var(--primary)]"
                    checked={wholesaleMode}
                    onChange={(event) => applyWholesaleMode(event.target.checked)}
                  />
                  <span className="font-medium text-foreground">Precios al por mayor</span>
                </label>

                <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left">Producto</th>
                        <th className="px-3 py-2 text-left">Descripcion</th>
                        <th className="px-3 py-2 text-left">Cant</th>
                        <th className="px-3 py-2 text-left">Color</th>
                        <th className="px-3 py-2 text-left">Precio</th>
                        <th className="px-3 py-2 text-left">Total</th>
                        <th className="px-3 py-2 text-left">Accion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupedLines.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-3 py-8 text-center text-sm text-muted-foreground">
                            <div className="flex flex-col items-center gap-3">
                              <div className="rounded-full border border-border bg-muted p-2">
                                <Boxes className="h-4 w-4 text-muted-foreground" />
                              </div>
                              <p>No hay productos agregados.</p>
                              <Button type="button" size="lg" onClick={openAddProductModal}>
                                <Plus className="h-4 w-4" />
                                Agregar producto
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        groupedLines.map((group) =>
                          group.type === "combo" ? (
                            // Combo: una sola fila con el nombre y codigo del combo.
                            <tr key={group.key} className="border-t border-border bg-card transition hover:bg-muted/40">
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-2.5">
                                  {group.thumbnailUrl ? (
                                    <img
                                      src={group.thumbnailUrl}
                                      alt={group.comboName}
                                      className="h-10 w-10 shrink-0 rounded-md border border-border object-cover"
                                    />
                                  ) : (
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
                                      <Boxes className="h-4 w-4 text-primary" />
                                    </div>
                                  )}
                                  <div className="min-w-0">
                                    <p className="truncate font-medium text-foreground">{group.comboName}</p>
                                    <div className="flex items-center gap-2">
                                      <span className="truncate text-xs text-muted-foreground">{group.comboCode || "Sin codigo"}</span>
                                      <FulfillmentBadge mode={group.fulfillmentMode} />
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-2 text-foreground">{group.description || "-"}</td>
                              <td className="px-3 py-2 text-foreground">{group.comboQuantity}</td>
                              <td className="px-3 py-2 text-foreground">{group.color || "-"}</td>
                              <td className="px-3 py-2 text-foreground">
                                {(group.comboQuantity > 0 ? group.total / group.comboQuantity : group.total).toLocaleString(
                                  "es-CO",
                                  { style: "currency", currency },
                                )}
                              </td>
                              <td className="px-3 py-2 font-semibold text-foreground">
                                {group.total.toLocaleString("es-CO", { style: "currency", currency })}
                              </td>
                              <td className="px-3 py-2">
                                <Button
                                  type="button"
                                  variant="destructive"
                                  size="icon"
                                  onClick={() => removeCombo(group.key)}
                                  aria-label="Quitar combo"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </td>
                            </tr>
                          ) : (
                            (() => {
                              const { line, product } = group.item;
                              return (
                                <tr key={line.uid} className="border-t border-border bg-card transition hover:bg-muted/40">
                                  <td className="px-3 py-2">
                                    <div className="flex items-center gap-2.5">
                                      {line.imageUrl || product?.thumbnailUrl ? (
                                        <img
                                          src={line.imageUrl || product?.thumbnailUrl || ""}
                                          alt={product?.name || "Producto"}
                                          className="h-10 w-10 shrink-0 rounded-md border border-border object-cover"
                                        />
                                      ) : (
                                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-[10px] text-muted-foreground">
                                          Sin img
                                        </div>
                                      )}
                                      <div className="min-w-0">
                                        <p className="truncate font-medium text-foreground">{product?.name || "Producto"}</p>
                                        <div className="flex items-center gap-2">
                                          <span className="truncate text-xs text-muted-foreground">{product?.code || "Sin codigo"}</span>
                                          <FulfillmentBadge mode={line.fulfillmentMode} />
                                        </div>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-3 py-2 text-foreground">{line.description || "-"}</td>
                                  <td className="px-3 py-2 text-foreground">{line.quantity}</td>
                                  <td className="px-3 py-2 text-foreground">{line.color || "-"}</td>
                                  <td className="px-3 py-2 text-foreground">
                                    {line.unitPrice.toLocaleString("es-CO", { style: "currency", currency })}
                                  </td>
                                  <td className="px-3 py-2 font-semibold text-foreground">
                                    {/* Total real del producto (precio x cantidad). El costo adicional
                                        no se muestra dentro del mueble: va en "Valor adicional". */}
                                    {(line.quantity * line.unitPrice).toLocaleString("es-CO", { style: "currency", currency })}
                                  </td>
                                  <td className="px-3 py-2">
                                    <Button
                                      type="button"
                                      variant="destructive"
                                      size="icon"
                                      onClick={() => removeLine(line.uid)}
                                      aria-label="Quitar producto"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </td>
                                </tr>
                              );
                            })()
                          ),
                        )
                      )}
                    </tbody>
                  </table>
                </div>

                {linesWithMeta.length > 0 ? (
                  <div className="flex justify-center">
                    <Button type="button" size="lg" onClick={openAddProductModal}>
                      <Plus className="h-4 w-4" />
                      Agregar producto
                    </Button>
                  </div>
                ) : null}

                <div className="grid gap-2 rounded-xl border border-border bg-muted/40 p-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-lg border border-border bg-card/80 px-3 py-2">
                    <span className="text-sm font-medium text-foreground">Subtotal</span>
                    <p className="mt-1 text-lg font-medium text-foreground">
                      {quoteSubtotal.toLocaleString("es-CO", {
                        style: "currency",
                        currency,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-card/80 px-3 py-2">
                    <span className="text-sm font-medium text-foreground">Descuento</span>
                    <p className="mt-1 text-lg font-medium text-foreground">
                      {quoteDiscountTotal.toLocaleString("es-CO", {
                        style: "currency",
                        currency,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-card/80 px-3 py-2">
                    <span className="text-sm font-medium text-foreground">Valor adicional</span>
                    <p className="mt-1 text-lg font-medium text-foreground">
                      {quoteAdditionalCostTotal.toLocaleString("es-CO", {
                        style: "currency",
                        currency,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-card/80 px-3 py-2">
                    <span className="text-sm font-medium text-foreground">Total</span>
                    <p className="mt-1 text-lg font-bold text-foreground">
                      {quoteTotal.toLocaleString("es-CO", {
                        style: "currency",
                        currency,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="lg"
                    onClick={() => {
                      setIsManualQuoteSubmit(false);
                      setStep(2);
                    }}
                    className="w-full sm:w-auto"
                    disabled={lines.length === 0}
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {isEdit ? (
                  <div className="grid gap-3 rounded-xl border border-border bg-card p-3 md:grid-cols-3">
                    <label className="space-y-1.5 block">
                      <span className="text-sm font-medium text-foreground">Estado</span>
                      <select
                        className="field-select"
                        value={status}
                        onChange={(event) => setStatus(event.target.value as QuoteStatus)}
                      >
                        <option value="DRAFT">Revisión</option>
                        <option value="SENT">Enviada</option>
                        <option value="ACCEPTED">Aceptada</option>
                        <option value="REJECTED">Rechazada</option>
                        <option value="EXPIRED">Expirada</option>
                      </select>
                    </label>
                    <label className="space-y-1.5 block">
                      <span className="text-sm font-medium text-foreground">Valida hasta</span>
                      <DatePicker value={validUntil} onChange={setValidUntil} />
                    </label>
                    <label className="space-y-1.5 block">
                      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
                        <StickyNote className="h-3.5 w-3.5 text-muted-foreground" />
                        Notas
                      </span>
                      <Input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Notas" />
                    </label>
                  </div>
                ) : null}

                <div className="rounded-xl border border-border bg-card p-3">
                  <p className="text-sm font-semibold text-foreground">Datos del cliente</p>
                  <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Nombre</p>
                      <p className="font-medium text-foreground">{clientId ? selectedClient?.name ?? clientName : clientName}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">NIT</p>
                      <p className="font-medium text-foreground">{clientDocument || "-"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Correo</p>
                      <p className="font-medium text-foreground">{clientEmail || "-"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Telefono</p>
                      <p className="font-medium text-foreground">{clientPhone || "-"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Direccion</p>
                      <p className="font-medium text-foreground">{clientAddress || "-"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Barrio</p>
                      <p className="font-medium text-foreground">{clientNeighborhood || "-"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Departamento</p>
                      <p className="font-medium text-foreground">{clientDepartment || "-"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Ciudad</p>
                      <p className="font-medium text-foreground">{clientCity || "-"}</p>
                    </div>
                  </div>
                </div>

                <div className="overflow-hidden rounded-xl border border-border bg-card">
                  <div className="border-b border-border bg-muted px-3 py-2">
                    <p className="text-sm font-semibold text-foreground">Productos</p>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="bg-card text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left">Producto</th>
                        <th className="px-3 py-2 text-left">Descripcion</th>
                        <th className="px-3 py-2 text-left">Cant</th>
                        <th className="px-3 py-2 text-left">Color</th>
                        <th className="px-3 py-2 text-left">Precio</th>
                        <th className="px-3 py-2 text-left">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupedLines.map((group) =>
                        group.type === "combo" ? (
                          <tr key={group.key} className="border-t border-border">
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2.5">
                                {group.thumbnailUrl ? (
                                  <img
                                    src={group.thumbnailUrl}
                                    alt={group.comboName}
                                    className="h-10 w-10 shrink-0 rounded-md border border-border object-cover"
                                  />
                                ) : (
                                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
                                    <Boxes className="h-4 w-4 text-primary" />
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <p className="truncate font-medium text-foreground">{group.comboName}</p>
                                  <div className="flex items-center gap-2">
                                    <span className="truncate text-xs text-muted-foreground">{group.comboCode || "Sin codigo"}</span>
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-foreground">{group.description || "-"}</td>
                            <td className="px-3 py-2 text-foreground">{group.comboQuantity}</td>
                            <td className="px-3 py-2 text-foreground">{group.color || "-"}</td>
                            <td className="px-3 py-2 text-foreground">
                              {(group.comboQuantity > 0 ? group.total / group.comboQuantity : group.total).toLocaleString(
                                "es-CO",
                                { style: "currency", currency },
                              )}
                            </td>
                            <td className="px-3 py-2 font-semibold text-foreground">
                              {group.total.toLocaleString("es-CO", { style: "currency", currency })}
                            </td>
                          </tr>
                        ) : (
                          (() => {
                            const { line, product } = group.item;
                            return (
                              <tr key={line.uid} className="border-t border-border">
                                <td className="px-3 py-2">
                                  <div className="flex items-center gap-2.5">
                                    {line.imageUrl || product?.thumbnailUrl ? (
                                      <img
                                        src={line.imageUrl || product?.thumbnailUrl || ""}
                                        alt={product?.name || "Producto"}
                                        className="h-10 w-10 shrink-0 rounded-md border border-border object-cover"
                                      />
                                    ) : (
                                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-[10px] text-muted-foreground">
                                        Sin img
                                      </div>
                                    )}
                                    <div className="min-w-0">
                                      <p className="truncate font-medium text-foreground">{product?.name || "Producto"}</p>
                                      <div className="flex items-center gap-2">
                                        <span className="truncate text-xs text-muted-foreground">{product?.code || "Sin codigo"}</span>
                                        <FulfillmentBadge mode={line.fulfillmentMode} canStock={(product?.stock ?? 0) > 0} />
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-3 py-2 text-foreground">{line.description || "-"}</td>
                                <td className="px-3 py-2 text-foreground">{line.quantity}</td>
                                <td className="px-3 py-2 text-foreground">{line.color || "-"}</td>
                                <td className="px-3 py-2 text-foreground">
                                  {line.unitPrice.toLocaleString("es-CO", { style: "currency", currency })}
                                </td>
                                <td className="px-3 py-2 font-semibold text-foreground">
                                  {(line.quantity * line.unitPrice).toLocaleString("es-CO", { style: "currency", currency })}
                                </td>
                              </tr>
                            );
                          })()
                        ),
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="grid gap-2 rounded-lg border border-border bg-muted p-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-lg border border-border bg-card px-3 py-2">
                    <span className="text-sm font-medium text-foreground">Subtotal</span>
                    <p className="mt-1 text-lg font-medium text-foreground">
                      {quoteSubtotal.toLocaleString("es-CO", {
                        style: "currency",
                        currency,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-card px-3 py-2">
                    <span className="text-sm font-medium text-foreground">Descuento</span>
                    <p className="mt-1 text-lg font-medium text-foreground">
                      {quoteDiscountTotal.toLocaleString("es-CO", {
                        style: "currency",
                        currency,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-card px-3 py-2">
                    <span className="text-sm font-medium text-foreground">Valor adicional</span>
                    <p className="mt-1 text-lg font-medium text-foreground">
                      {quoteAdditionalCostTotal.toLocaleString("es-CO", {
                        style: "currency",
                        currency,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-card px-3 py-2">
                    <span className="text-sm font-medium text-foreground">Total</span>
                    <p className="mt-1 text-lg font-bold text-foreground">
                      {quoteTotal.toLocaleString("es-CO", {
                        style: "currency",
                        currency,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
                  <Button type="button" variant="outline" size="lg" onClick={() => setStep(2)}>
                    Atras
                  </Button>
                  <Button
                    type="button"
                    size="lg"
                    onClick={(event) => {
                      setIsManualQuoteSubmit(true);
                      event.currentTarget.form?.requestSubmit();
                    }}
                    className="w-full sm:w-auto"
                    disabled={!isClientResolved || lines.length === 0}
                  >
                    {submitLabel}
                  </Button>
                </div>
              </div>
            )}
          </form>
        </div>
      </div>

      <Dialog open={openProductModal} onOpenChange={setOpenProductModal}>
        <DialogContent className="flex max-h-[92vh] w-full max-w-3xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b px-6 py-4">
            <DialogTitle className="inline-flex items-center gap-2">
              <Boxes className="h-4 w-4 text-muted-foreground" />
              <span>Agregar producto</span>
            </DialogTitle>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
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
                          {/* Bolita de stock (cuantos hay disponibles). */}
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
                              {product.retailPrice.toLocaleString("es-CO", { style: "currency", currency })}
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
                      value={draftQuantity}
                      onChange={(event) => setDraftQuantity(event.target.value)}
                      className="h-9 w-20"
                    />
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={clearDraftProductSelection}
                    aria-label="Cambiar producto"
                    title="Cambiar producto"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>

                <div className="grid gap-3 rounded-xl border border-border bg-muted/60 p-3 md:grid-cols-2">
                  <label className="space-y-1.5">
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
                      <Palette className="h-3.5 w-3.5 text-muted-foreground" />
                      Color
                    </span>
                    <Input value={draftColor} onChange={(event) => setDraftColor(event.target.value)} placeholder="Color" />
                  </label>

                  <label className="space-y-1.5">
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
                      <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                      Tipo de venta
                    </span>
                    <select
                      className="field-select"
                      value={draftFulfillmentMode}
                      onChange={(event) => setDraftFulfillmentMode(event.target.value as FulfillmentMode)}
                    >
                      {/* Sin stock solo se puede fabricar por orden. */}
                      {(draftProduct?.stock ?? 0) > 0 ? (
                        <option value="STOCK">Por stock (de existencias)</option>
                      ) : null}
                      <option value="MANUFACTURE">Por orden (se fabrica)</option>
                    </select>
                  </label>

                  <label className="space-y-1.5">
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
                      <Percent className="h-3.5 w-3.5 text-muted-foreground" />
                      Descuento
                    </span>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={draftDiscount}
                      onChange={(event) => setDraftDiscount(event.target.value)}
                    />
                  </label>

                  <label className="space-y-1.5">
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
                      <Coins className="h-3.5 w-3.5 text-muted-foreground" />
                      Costo adicional
                    </span>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={draftAdditionalCost}
                      onChange={(event) => setDraftAdditionalCost(event.target.value)}
                    />
                  </label>

                  <div className="grid gap-3 rounded-xl border border-border bg-card p-3 md:col-span-2 md:grid-cols-[7.5rem_minmax(0,1fr)] md:items-start">
                    <div className="flex flex-col items-start gap-1.5">
                      <label
                        className="group relative flex h-28 w-28 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-border bg-muted transition hover:border-[var(--primary)]/50"
                        title="Subir foto para la cotizacion"
                      >
                        <input
                          type="file"
                          accept="image/*"
                          className="sr-only"
                          disabled={isUploadingImage}
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.target.value = "";
                            void handleImageUpload(file);
                          }}
                        />
                        {draftImageUrl || draftProduct?.thumbnailUrl ? (
                          <>
                            <ProductThumb
                              src={draftImageUrl || draftProduct?.thumbnailUrl || ""}
                              alt={draftProduct?.name ?? "Producto"}
                              className="h-full w-full object-cover"
                            />
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/45 text-white opacity-0 transition group-hover:opacity-100">
                              {isUploadingImage ? (
                                <Loader2 className="h-5 w-5 animate-spin" />
                              ) : (
                                <>
                                  <ImagePlus className="h-5 w-5" />
                                  <span className="text-[11px] font-medium">Cambiar foto</span>
                                </>
                              )}
                            </div>
                          </>
                        ) : (
                          <div className="flex flex-col items-center justify-center gap-1 text-muted-foreground">
                            {isUploadingImage ? (
                              <Loader2 className="h-5 w-5 animate-spin" />
                            ) : (
                              <>
                                <ImagePlus className="h-5 w-5" />
                                <span className="text-[11px] font-medium">Agregar foto</span>
                              </>
                            )}
                          </div>
                        )}
                      </label>
                      {draftImageUrl ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-auto px-1 py-0 text-xs text-muted-foreground"
                          onClick={() => setDraftImageUrl("")}
                        >
                          Quitar foto
                        </Button>
                      ) : null}
                    </div>

                    <label className="space-y-1.5">
                      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
                        <AlignLeft className="h-3.5 w-3.5 text-muted-foreground" />
                        Descripcion
                      </span>
                      <textarea
                        value={draftDescription}
                        onChange={(event) => setDraftDescription(event.target.value)}
                        rows={3}
                        className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                        placeholder="Descripcion del item"
                      />
                    </label>
                  </div>
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

              </>
            )}
          </div>

          {draftProductId ? (
            <div className="shrink-0 space-y-3 border-t bg-card px-6 py-4">
              <div className="flex items-center justify-between rounded-xl border border-[var(--primary)]/20 bg-[var(--primary)]/5 px-4 py-3">
                <span className="text-sm font-semibold text-foreground">Total a pagar</span>
                <span className="text-xl font-bold text-[var(--primary)]">
                  {draftLineTotal.toLocaleString("es-CO", { style: "currency", currency })}
                </span>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" size="lg" onClick={() => setOpenProductModal(false)}>
                  Cancelar
                </Button>
                <Button type="button" size="lg" onClick={addDraftProduct}>
                  Agregar producto
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
