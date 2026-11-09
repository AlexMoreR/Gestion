"use client";

import { Fragment, useEffect, useMemo, useState, useTransition, type FocusEvent } from "react";
import {
  AlignLeft,
  Boxes,
  Coins,
  FileText,
  ImagePlus,
  Link2,
  Loader2,
  Palette,
  Pencil,
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
  getCartaColoresAction,
} from "@/app/actions/quote-actions";
import { DatePicker } from "@/components/ui/date-picker";
import { todayInColombia } from "@/lib/colombia-time";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ProductThumb } from "@/components/admin/product-thumb";
import { expandComboLines, faltanPiezasCombo, pickComboPieces, type ComboComponent } from "@/lib/combo";
import type { SupportedCurrencyCode } from "@/lib/currency";
import { calculateQuoteLineTotal, colorLabel, lineasSinColor } from "@/lib/quote-item-meta";
import {
  aplicarEdicionCombo,
  COTIZACION_CON_VENTA_LINEAS,
  distributeAmount,
  resumenCombo,
  type ValoresCombo,
} from "@/lib/quote-lines";
import type { CartaColor, CartaColores } from "@/lib/carta-colores-crm";
import { textoColores, type ParteElegida, type ParteParaCotizar } from "@/lib/product-parts";
import { PartesColorSelector, partesIniciales } from "@/components/admin/partes-color-selector";
import { FulfillmentBadge, QuoteLineCard } from "@/components/admin/quote-line-card";
import { useIsMobile } from "@/hooks/use-mobile";
import { imageVariantUrl } from "@/lib/image-variants";
import { Button } from "../ui/button";
import { displayCode } from "@/lib/code-display";

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
  // Partes de color ya resueltas (propias o de la categoría). Vacío = selector de color de siempre.
  partes?: ParteParaCotizar[];
};

type FulfillmentMode = "STOCK" | "MANUFACTURE";

export type QuoteStatus = "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED";

type QuoteLine = {
  uid: string;
  productId: string;
  quantity: number;
  color: string;
  colorCodigo: string;
  colorMaterial: string;
  colorFotoUrl: string;
  // Color por parte (vacío = producto sin partes).
  partes: ParteElegida[];
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
  colorCodigo?: string;
  colorMaterial?: string;
  colorFotoUrl?: string;
  partes?: ParteElegida[];
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
  // Con venta creada las lineas no se cambian (el servidor lo rechaza igual).
  tieneVenta?: boolean;
};

const todayLocal = () => todayInColombia();

// Celular (< 640 px): casillas y listas de 44 px y letra de 16 px (con menos, el iPhone hace zoom al
// enfocar). Las listas llevan "!" porque .field-select va fuera de las capas de Tailwind. Con un campo
// activo queda espacio abajo para que hasta el ultimo se pueda centrar sobre el teclado; se quita 300 ms
// despues de soltar el campo, para que el boton que se toco no se mueva antes de recibir el toque.
const CUERPO_CELULAR =
  "max-sm:[&_input:not([type=checkbox]):not([type=file])]:h-11 max-sm:[&_input]:text-base max-sm:[&_select]:h-11! max-sm:[&_select]:text-base! max-sm:[&_textarea]:text-base max-sm:transition-[padding] max-sm:duration-0 max-sm:delay-300 max-sm:has-[:is(input,select,textarea):focus]:pb-[50vh] max-sm:has-[:is(input,select,textarea):focus]:delay-0";

// Al enfocar una casilla en celular la lleva al centro cuando el teclado ya abrio (unos 300 ms).
const centrarCampoEnCelular = (event: FocusEvent<HTMLElement>) => {
  const campo = event.target;
  if (!(campo instanceof HTMLInputElement || campo instanceof HTMLSelectElement || campo instanceof HTMLTextAreaElement)) return;
  if (!window.matchMedia("(max-width: 639px)").matches) return;
  window.setTimeout(() => {
    if (document.activeElement === campo) campo.scrollIntoView({ block: "center" });
  }, 300);
};

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
  tieneVenta = false,
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
      colorCodigo: item.colorCodigo ?? "",
      colorMaterial: item.colorMaterial ?? "",
      colorFotoUrl: item.colorFotoUrl ?? "",
      partes: item.partes ?? [],
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
  // Color de la carta del CRM (null = escrito a mano o sin color).
  const [draftCartaColor, setDraftCartaColor] = useState<(CartaColor & { material: string }) | null>(null);
  const [manualColor, setManualColor] = useState(false);
  // Color por parte del producto en borrador (solo si tiene partes).
  const [draftPartes, setDraftPartes] = useState<ParteElegida[]>([]);
  const [carta, setCarta] = useState<CartaColores | null>(null);
  const cartaMateriales = carta?.materiales ?? [];
  // Sin carta (CRM caido y sin copia) solo queda escribir el color a mano.
  const colorManual = manualColor || (carta !== null && cartaMateriales.length === 0);
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
  // Debajo de 1024 px las lineas se ven como tarjetas; el selector de colores va solo en la vista activa.
  const vistaTarjetas = useIsMobile(1024);
  // Linea (uid) o combo (comboKey) que se esta editando en el panel; null = agregando.
  const [editing, setEditing] = useState<{
    uid: string;
    comboKey: string;
    nombre: string;
    codigo: string;
    foto: string;
    partesDef: ParteParaCotizar[];
    colorInicial: string;
  } | null>(null);
  // Se prende al tocar Generar/Guardar; el aviso se calcula en vivo y se va solo al escoger el color.
  const [revisarColores, setRevisarColores] = useState(false);

  // Al abrir, arrancamos siempre en el paso 1 (Productos). El cliente ya viene
  // precargado en edicion, asi que no mostramos el formulario expandido.
  useEffect(() => {
    if (open) {
      setStep(1);
      setRevisarColores(false);
      setShowClientForm(false);
    }
  }, [open]);

  // La carta de colores del CRM se pide una vez al abrir el editor (el servidor la guarda 5 min).
  useEffect(() => {
    if (!open || carta) return;
    let vivo = true;
    getCartaColoresAction()
      .then((result) => {
        if (vivo) setCarta(result);
      })
      .catch(() => {
        if (vivo) setCarta({ materiales: [], origen: "nada" });
      });
    return () => {
      vivo = false;
    };
  }, [open, carta]);

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
  // En edicion, las partes de la linea (un combo usa las del combo, no las de una pieza).
  const draftPartesDef = editing ? editing.partesDef : (draftProduct?.partes ?? []);

  // Partes de una linea ya agregada: las del combo (por su codigo) o las del producto suelto.
  const duenioDeLinea = (line: QuoteLine) =>
    line.comboKey
      ? products.find((product) => line.comboCode && product.code === line.comboCode)
      : products.find((product) => product.id === line.productId);
  const partesDeLinea = (line: QuoteLine): ParteParaCotizar[] => duenioDeLinea(line)?.partes ?? [];

  // Cambia el color por parte de una linea (o de todas las lineas del combo).
  const updateLinePartes = (match: (line: QuoteLine) => boolean, partes: ParteElegida[]) => {
    setLines((current) =>
      current.map((line) =>
        match(line)
          ? { ...line, partes, color: textoColores(partes), colorCodigo: "", colorMaterial: "", colorFotoUrl: "" }
          : line,
      ),
    );
  };

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
        partes: ParteElegida[];
        firstLine: QuoteLine;
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
          color: colorLabel(item.line),
          description: item.line.description,
          thumbnailUrl: item.line.imageUrl || item.product?.thumbnailUrl || "",
          total: item.lineTotal,
          partes: item.line.partes,
          firstLine: item.line,
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
    setDraftCartaColor(null);
    setManualColor(false);
    setDraftPartes([]);
    setDraftUnitPrice("");
    setDraftDescription("");
    setDraftAdditionalCost("0");
    setDraftDiscount("0");
    setDraftFulfillmentMode("STOCK");
    setDraftImageUrl("");
    setIsUploadingImage(false);
    setProductFormError("");
    setEditing(null);
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
    setDraftPartes(partesIniciales(product.partes ?? []));
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
    setDraftPartes([]);
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

  // Valida los numeros del panel (agregar y editar). Null = hay error y ya se mostro.
  const leerValoresDraft = (): ValoresCombo | null => {
    const quantity = Number(draftQuantity || 0);
    const unitPrice = Number(draftUnitPrice || 0);
    const additionalCost = Number(draftAdditionalCost || 0);
    const discount = Number(draftDiscount || 0);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setProductFormError("La cantidad debe ser mayor a 0.");
      return null;
    }

    if (!Number.isInteger(quantity)) {
      setProductFormError("La cantidad debe ser un número entero.");
      return null;
    }

    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      setProductFormError("El precio debe ser mayor a 0.");
      return null;
    }

    if (!Number.isFinite(additionalCost) || additionalCost < 0) {
      setProductFormError("El costo adicional no puede ser negativo.");
      return null;
    }

    if (!Number.isFinite(discount) || discount < 0) {
      setProductFormError("El descuento no puede ser negativo.");
      return null;
    }

    // El enlace publico resta el descuento sobre la suma y la pantalla recorta por linea: si pasa del valor, no cuadran.
    if (discount > quantity * unitPrice + additionalCost) {
      setProductFormError("El descuento no puede ser mayor que el valor del producto (cantidad × precio + costo adicional).");
      return null;
    }

    return { quantity, unitPrice, additionalCost, discount };
  };

  // Con partes: un color por parte (el texto sale de ellas). Si no, color escogido de la carta
  // (con codigo, material y foto) o escrito a mano (solo el nombre).
  const colorDraft = () =>
    draftPartesDef.length > 0
      ? { color: textoColores(draftPartes), colorCodigo: "", colorMaterial: "", colorFotoUrl: "", partes: draftPartes }
      : draftCartaColor
        ? {
            color: draftCartaColor.nombre,
            colorCodigo: draftCartaColor.codigo,
            colorMaterial: draftCartaColor.material,
            colorFotoUrl: draftCartaColor.fotoUrl,
            partes: [],
          }
        : { color: draftColor.trim(), colorCodigo: "", colorMaterial: "", colorFotoUrl: "", partes: [] };

  // Huella del color del panel: si no cambia, la linea conserva su color tal cual (colores viejos o partes fuera de la lista).
  const claveColor = (
    color: string,
    cartaColor: { codigo: string; material: string } | null,
    partes: ParteElegida[],
  ) => JSON.stringify([color.trim(), cartaColor?.codigo ?? "", cartaColor?.material ?? "", partes]);

  // Abre el panel con los datos de una linea suelta o de todas las lineas de un combo.
  const abrirEdicion = (lineas: QuoteLine[], nombre: string, codigo: string) => {
    const first = lineas[0];
    if (!first) return;
    const owner = duenioDeLinea(first);
    const partesDef = partesDeLinea(first);
    const valores: ValoresCombo = first.comboKey
      ? resumenCombo(lineas)
      : {
          quantity: first.quantity,
          unitPrice: first.unitPrice,
          discount: first.discount,
          additionalCost: first.additionalCost,
        };
    const cartaColor = first.colorCodigo
      ? { codigo: first.colorCodigo, nombre: first.color, fotoUrl: first.colorFotoUrl, material: first.colorMaterial }
      : null;
    const partes = partesDef.length > 0 ? partesIniciales(partesDef, first.partes) : [];

    resetDraftProduct();
    setDraftProductId(owner?.id ?? first.productId);
    setDraftQuantity(String(valores.quantity));
    setDraftUnitPrice(String(valores.unitPrice));
    setDraftDiscount(String(valores.discount));
    setDraftAdditionalCost(String(valores.additionalCost));
    setDraftDescription(first.description);
    setDraftImageUrl(first.imageUrl);
    setDraftFulfillmentMode(first.fulfillmentMode);
    setDraftCartaColor(cartaColor);
    setDraftColor(first.color);
    setManualColor(!first.colorCodigo && Boolean(first.color.trim()));
    setDraftPartes(partes);
    setEditing({
      uid: first.uid,
      comboKey: first.comboKey,
      nombre,
      codigo,
      foto: owner?.thumbnailUrl ?? products.find((product) => product.id === first.productId)?.thumbnailUrl ?? "",
      partesDef,
      colorInicial: claveColor(first.color, cartaColor, partes),
    });
    setOpenProductModal(true);
  };

  // Guarda el panel de edicion: la linea (o el combo) cambia en su sitio y conserva uid y posicion.
  const guardarEdicion = () => {
    if (!editing) return;
    const valores = leerValoresDraft();
    if (!valores) return;
    const colorCambio = claveColor(draftColor, draftCartaColor, draftPartes) !== editing.colorInicial;
    const comunes = {
      description: draftDescription.trim(),
      imageUrl: draftImageUrl.trim(),
      ...(colorCambio ? colorDraft() : {}),
    };
    setLines((current) => {
      if (editing.comboKey) {
        const delCombo = current.filter((line) => line.comboKey === editing.comboKey);
        const editadas = new Map(
          aplicarEdicionCombo(delCombo, valores).map((line) => [line.uid, { ...line, ...comunes }]),
        );
        return current.map((line) => editadas.get(line.uid) ?? line);
      }
      return current.map((line) => (line.uid === editing.uid ? { ...line, ...valores, ...comunes } : line));
    });
    setOpenProductModal(false);
    resetDraftProduct();
  };

  const addDraftProduct = () => {
    if (!draftProductId) {
      setProductFormError("Selecciona un producto por codigo.");
      return;
    }

    const valores = leerValoresDraft();
    if (!valores) return;
    const { quantity, unitPrice, additionalCost, discount } = valores;
    const draftColorFields = colorDraft();

    // Si es un combo, se separa en sus componentes (cada uno conserva su
    // producto real y su proveedor); el precio del combo se reparte entre las
    // lineas. El descuento y costo adicional del combo se REPARTEN entre las
    // lineas (proporcional a su valor) para que ninguna linea quede recortada a
    // 0 y el desglose cuadre con el total.
    if (draftProduct?.isBundle && draftProduct.components && draftProduct.components.length > 0) {
      // Por stock: cada pieza sale de la que hay (principal o alterna).
      const pieces =
        draftFulfillmentMode === "STOCK"
          ? pickComboPieces(draftProduct.components, quantity)
          : draftProduct.components;
      const expanded = expandComboLines(pieces, quantity, unitPrice);
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
          ...draftColorFields,
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
        ...draftColorFields,
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
      colorCodigo: line.colorCodigo || null,
      colorMaterial: line.colorMaterial || null,
      colorFotoUrl: line.colorFotoUrl || null,
      // Con partes el servidor arma el texto del color.
      ...(line.partes.length > 0 ? { color: null, partes: line.partes } : {}),
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

  const faltanColoresLista = lineasSinColor(
    lines.map((line) => {
      const duenio = duenioDeLinea(line);
      return {
        etiqueta: displayCode(line.comboCode || duenio?.code || "") || line.comboName || duenio?.name || "Producto",
        requeridas: partesDeLinea(line).map((parte) => parte.nombre),
        elegidos: line.partes,
        combo: Boolean(line.comboKey),
        color: line.color,
      };
    }),
  );

  const action = isEdit ? adminUpdateQuoteFullAction : adminCreateQuoteAction;
  const title = isEdit ? `Editar cotizacion ${displayCode(quoteCode)}` : "Nueva cotizacion";
  const submitLabel = isEdit ? "Guardar cambios" : "Generar cotizacion";

  const sinProductos = (
    <div className="flex flex-col items-center gap-3 text-center text-sm text-muted-foreground">
      <div className="rounded-full border border-border bg-muted p-2">
        <Boxes className="h-4 w-4 text-muted-foreground" />
      </div>
      <p>No hay productos agregados.</p>
      <Button type="button" size="lg" onClick={openAddProductModal}>
        <Plus className="h-4 w-4" />
        Agregar producto
      </Button>
    </div>
  );

  // Lineas como tarjetas (pasos 1 y 3). editable: paso 1, con Editar, borrar y colores por parte.
  const tarjetasDeLineas = (editable: boolean) =>
    groupedLines.map((group) => {
      if (group.type === "combo") {
        const partesDef = partesDeLinea(group.firstLine);
        return (
          <QuoteLineCard
            key={group.key}
            name={group.comboName}
            code={group.comboCode}
            imageUrl={group.thumbnailUrl}
            isCombo
            fulfillmentMode={group.fulfillmentMode}
            description={group.description}
            color={group.color}
            quantity={group.comboQuantity}
            unitPrice={group.comboQuantity > 0 ? group.total / group.comboQuantity : group.total}
            total={group.total}
            currency={currency}
            onEdit={
              editable && !tieneVenta
                ? () =>
                    abrirEdicion(
                      lines.filter((line) => line.comboKey === group.key),
                      group.comboName,
                      group.comboCode,
                    )
                : undefined
            }
            onRemove={editable ? () => removeCombo(group.key) : undefined}
            removeLabel="Quitar combo"
          >
            {editable && vistaTarjetas && partesDef.length > 0 ? (
              <PartesColorSelector
                idPrefix={`combo-${group.key}`}
                vistaProductId={duenioDeLinea(group.firstLine)?.id}
                partes={partesDef}
                carta={carta ? cartaMateriales : null}
                elegidos={group.partes}
                onChange={(next) => updateLinePartes((line) => line.comboKey === group.key, next)}
              />
            ) : null}
          </QuoteLineCard>
        );
      }
      const { line, product } = group.item;
      const partesDef = partesDeLinea(line);
      return (
        <QuoteLineCard
          key={line.uid}
          name={product?.name || "Producto"}
          code={product?.code || ""}
          imageUrl={line.imageUrl || product?.thumbnailUrl || ""}
          fulfillmentMode={line.fulfillmentMode}
          description={line.description}
          color={colorLabel(line)}
          quantity={line.quantity}
          unitPrice={line.unitPrice}
          total={line.quantity * line.unitPrice}
          currency={currency}
          onEdit={
            editable && !tieneVenta
              ? () => abrirEdicion([line], product?.name || "Producto", product?.code || "")
              : undefined
          }
          onRemove={editable ? () => removeLine(line.uid) : undefined}
        >
          {editable && vistaTarjetas && partesDef.length > 0 ? (
            <PartesColorSelector
              idPrefix={`linea-${line.uid}`}
              vistaProductId={line.productId}
              partes={partesDef}
              carta={carta ? cartaMateriales : null}
              elegidos={line.partes}
              onChange={(next) => updateLinePartes((item) => item.uid === line.uid, next)}
            />
          ) : null}
        </QuoteLineCard>
      );
    });

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
          className="relative flex h-[100dvh] w-full max-w-6xl flex-col overflow-hidden rounded-none border border-border bg-card p-3 sm:mx-auto sm:block sm:h-auto sm:max-h-[92vh] sm:overflow-y-auto sm:overflow-x-hidden sm:rounded-xl sm:p-4 md:p-5"
          onClick={(event) => event.stopPropagation()}
        >
          {/* Celular: titulo y cerrar en una fila, la Fecha debajo. Escritorio: titulo, Fecha y cerrar a la derecha. */}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 sm:mb-4">
            <h2 className="inline-flex min-w-0 flex-1 items-center gap-2 text-lg font-semibold text-foreground sm:flex-none">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="break-words">{title}</span>
            </h2>
            <label className="order-last inline-flex w-full items-center gap-2 sm:order-none sm:mr-auto sm:w-auto">
              <span className="text-sm font-medium text-muted-foreground">Fecha</span>
              <DatePicker value={createdAt} onChange={setCreatedAt} className="max-sm:h-11" />
            </label>
            <Button type="button" variant="outline" size="icon" className="size-11 sm:size-8" onClick={onClose} aria-label="Cerrar">
              <X className="h-4 w-4" />
            </Button>
          </div>

          <form
            action={action}
            className="flex min-h-0 flex-1 flex-col space-y-4 sm:block"
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
              <div className="grid grid-cols-3 gap-1.5">
                <div className={`rounded-lg border p-2 transition ${step >= 1 ? "border-[var(--primary)]/30 bg-[var(--primary)]/5" : "border-border bg-card"}`}>
                  <div className="flex items-center gap-2">
                    <div className={`hidden h-6 w-6 shrink-0 items-center justify-center rounded-md border sm:inline-flex ${step === 1 ? "border-[var(--primary)] bg-[var(--primary)] text-primary-foreground" : "border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"}`}>
                      <Boxes className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <p className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Paso 1</p>
                      <p className="whitespace-nowrap text-xs font-semibold text-foreground">Productos</p>
                    </div>
                  </div>
                </div>

                <div className={`rounded-lg border p-2 transition ${step >= 2 ? "border-[var(--primary)]/30 bg-[var(--primary)]/5" : "border-border bg-card"}`}>
                  <div className="flex items-center gap-2">
                    <div className={`hidden h-6 w-6 shrink-0 items-center justify-center rounded-md border sm:inline-flex ${step === 2 ? "border-[var(--primary)] bg-[var(--primary)] text-primary-foreground" : step > 2 ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "border-border bg-card text-muted-foreground"}`}>
                      <UserRound className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <p className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Paso 2</p>
                      <p className="whitespace-nowrap text-xs font-semibold text-foreground">Cliente</p>
                    </div>
                  </div>
                </div>

                <div className={`rounded-lg border p-2 transition ${step >= 3 ? "border-[var(--primary)]/30 bg-[var(--primary)]/5" : "border-border bg-card"}`}>
                  <div className="flex items-center gap-2">
                    <div className={`hidden h-6 w-6 shrink-0 items-center justify-center rounded-md border sm:inline-flex ${step === 3 ? "border-[var(--primary)] bg-[var(--primary)] text-primary-foreground" : "border-border bg-card text-muted-foreground"}`}>
                      <Link2 className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <p className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Paso 3</p>
                      <p className="whitespace-nowrap text-xs font-semibold text-foreground">{isEdit ? "Finalizar" : "Generar"}</p>
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

            {/* Celular: solo este cuerpo se desplaza; encabezado y pasos quedan quietos arriba. */}
            <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain sm:overflow-visible ${CUERPO_CELULAR}`} onFocus={centrarCampoEnCelular}>
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
                                    className="h-auto min-h-11 w-full justify-between gap-2 whitespace-normal px-2.5 py-2 text-left font-normal"
                                  >
                                    <span className="inline-flex min-w-0 items-center gap-2 break-words text-foreground">
                                      <UserRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                      <span className="min-w-0">{getClientDisplayName(client)}</span>
                                    </span>
                                    <span className="shrink-0 text-xs text-muted-foreground">{client.phone || "Sin telefono"}</span>
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

                {/* Avisos y botones juntos: en celular quedan pegados abajo. */}
                <div className="sticky bottom-0 z-10 space-y-2 border-t border-border bg-card pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:space-y-4">
                {clientFormError ? <p className="text-xs font-medium text-destructive">{clientFormError}</p> : null}

                <div className="flex gap-2 sm:justify-between">
                  <Button type="button" variant="outline" size="lg" className="h-11 flex-1 sm:h-9 sm:flex-none" onClick={() => setStep(1)}>
                    Atras
                  </Button>
                  <Button
                    type="button"
                    size="lg"
                    onClick={goToReviewStep}
                    disabled={!isClientResolved || isResolvingClient}
                    className="h-11 flex-1 sm:h-9 sm:w-auto sm:flex-none"
                  >
                    {isResolvingClient ? "Guardando cliente..." : "Siguiente"}
                  </Button>
                </div>
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

                {tieneVenta ? (
                  <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-600 dark:text-amber-400">
                    {COTIZACION_CON_VENTA_LINEAS}
                  </p>
                ) : null}

                {/* Debajo de 1024 px: tarjetas (las 7 columnas no caben). */}
                <div className="space-y-3 lg:hidden">
                  {groupedLines.length === 0 ? (
                    <div className="rounded-xl border border-border bg-card px-3 py-8">{sinProductos}</div>
                  ) : (
                    tarjetasDeLineas(true)
                  )}
                </div>

                <div className="hidden overflow-hidden rounded-xl border border-border bg-card shadow-sm lg:block">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/60 text-xs text-muted-foreground">
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
                          <td colSpan={7} className="px-3 py-8">
                            {sinProductos}
                          </td>
                        </tr>
                      ) : (
                        groupedLines.map((group) =>
                          group.type === "combo" ? (
                            // Combo: una sola fila con el nombre y codigo del combo.
                            <Fragment key={group.key}>
                            <tr className="border-t border-border bg-card transition hover:bg-muted/40">
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-2.5">
                                  {group.thumbnailUrl ? (
                                    <img
                                      src={imageVariantUrl(group.thumbnailUrl, "thumb")}
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
                                <div className="flex items-center gap-1.5">
                                  {!tieneVenta ? (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="icon"
                                      onClick={() =>
                                        abrirEdicion(
                                          lines.filter((line) => line.comboKey === group.key),
                                          group.comboName,
                                          group.comboCode,
                                        )
                                      }
                                      aria-label="Editar"
                                      title="Editar"
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                  ) : null}
                                  <Button
                                    type="button"
                                    variant="destructive"
                                    size="icon"
                                    onClick={() => removeCombo(group.key)}
                                    aria-label="Quitar combo"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                            {!vistaTarjetas && partesDeLinea(group.firstLine).length > 0 ? (
                              <tr className="bg-muted/30">
                                <td colSpan={7} className="px-3 pb-3 pt-1">
                                  <PartesColorSelector
                                    idPrefix={`combo-${group.key}`}
                                    vistaProductId={duenioDeLinea(group.firstLine)?.id}
                                    partes={partesDeLinea(group.firstLine)}
                                    carta={carta ? cartaMateriales : null}
                                    elegidos={group.partes}
                                    onChange={(next) => updateLinePartes((line) => line.comboKey === group.key, next)}
                                  />
                                </td>
                              </tr>
                            ) : null}
                            </Fragment>
                          ) : (
                            (() => {
                              const { line, product } = group.item;
                              const partesDef = partesDeLinea(line);
                              return (
                                <Fragment key={line.uid}>
                                <tr className="border-t border-border bg-card transition hover:bg-muted/40">
                                  <td className="px-3 py-2">
                                    <div className="flex items-center gap-2.5">
                                      {line.imageUrl || product?.thumbnailUrl ? (
                                        <img
                                          src={imageVariantUrl(line.imageUrl || product?.thumbnailUrl || "", "thumb")}
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
                                  <td className="px-3 py-2 text-foreground">{colorLabel(line) || "-"}</td>
                                  <td className="px-3 py-2 text-foreground">
                                    {line.unitPrice.toLocaleString("es-CO", { style: "currency", currency })}
                                  </td>
                                  <td className="px-3 py-2 font-semibold text-foreground">
                                    {/* Total real del producto (precio x cantidad). El costo adicional
                                        no se muestra dentro del mueble: va en "Valor adicional". */}
                                    {(line.quantity * line.unitPrice).toLocaleString("es-CO", { style: "currency", currency })}
                                  </td>
                                  <td className="px-3 py-2">
                                    <div className="flex items-center gap-1.5">
                                      {!tieneVenta ? (
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="icon"
                                          onClick={() =>
                                            abrirEdicion([line], product?.name || "Producto", product?.code || "")
                                          }
                                          aria-label="Editar"
                                          title="Editar"
                                        >
                                          <Pencil className="h-4 w-4" />
                                        </Button>
                                      ) : null}
                                      <Button
                                        type="button"
                                        variant="destructive"
                                        size="icon"
                                        onClick={() => removeLine(line.uid)}
                                        aria-label="Quitar producto"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </td>
                                </tr>
                                {!vistaTarjetas && partesDef.length > 0 ? (
                                  <tr className="bg-muted/30">
                                    <td colSpan={7} className="px-3 pb-3 pt-1">
                                      <PartesColorSelector
                                        idPrefix={`linea-${line.uid}`}
                                        vistaProductId={line.productId}
                                        partes={partesDef}
                                        carta={carta ? cartaMateriales : null}
                                        elegidos={line.partes}
                                        onChange={(next) => updateLinePartes((item) => item.uid === line.uid, next)}
                                      />
                                    </td>
                                  </tr>
                                ) : null}
                                </Fragment>
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

                <div className="sticky bottom-0 z-10 space-y-2 border-t border-border bg-card pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:static sm:border-0 sm:bg-transparent sm:p-0 flex justify-end">
                  <Button
                    type="button"
                    size="lg"
                    onClick={() => {
                      setIsManualQuoteSubmit(false);
                      setStep(2);
                    }}
                    className="h-11 w-full sm:h-9 sm:w-auto"
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
                      <DatePicker value={validUntil} onChange={setValidUntil} className="max-sm:h-11" />
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
                      <p className="break-words font-medium text-foreground">{clientName}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">NIT</p>
                      <p className="break-words font-medium text-foreground">{clientDocument || "-"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Correo</p>
                      <p className="break-words font-medium text-foreground">{clientEmail || "-"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Telefono</p>
                      <p className="break-words font-medium text-foreground">{clientPhone || "-"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Direccion</p>
                      <p className="break-words font-medium text-foreground">{clientAddress || "-"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Barrio</p>
                      <p className="break-words font-medium text-foreground">{clientNeighborhood || "-"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Departamento</p>
                      <p className="break-words font-medium text-foreground">{clientDepartment || "-"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Ciudad</p>
                      <p className="break-words font-medium text-foreground">{clientCity || "-"}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 lg:hidden">
                  <p className="text-sm font-semibold text-foreground">Productos</p>
                  {tarjetasDeLineas(false)}
                </div>

                <div className="hidden overflow-hidden rounded-xl border border-border bg-card lg:block">
                  <div className="border-b border-border bg-muted px-3 py-2">
                    <p className="text-sm font-semibold text-foreground">Productos</p>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="bg-card text-xs text-muted-foreground">
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
                                    src={imageVariantUrl(group.thumbnailUrl, "thumb")}
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
                                        src={imageVariantUrl(line.imageUrl || product?.thumbnailUrl || "", "thumb")}
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
                                <td className="px-3 py-2 text-foreground">{colorLabel(line) || "-"}</td>
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

                {/* Avisos y botones juntos: en celular quedan pegados abajo. */}
                <div className="sticky bottom-0 z-10 space-y-2 border-t border-border bg-card pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:space-y-3">
                {revisarColores && faltanColoresLista.length > 0 ? (
                  <p className="max-h-20 overflow-y-auto rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive sm:max-h-none">
                    Falta escoger el color: {faltanColoresLista.join(", ")}
                  </p>
                ) : null}

                <div className="flex gap-2 sm:justify-between">
                  <Button type="button" variant="outline" size="lg" className="h-11 flex-1 sm:h-9 sm:flex-none" onClick={() => setStep(2)}>
                    Atras
                  </Button>
                  <Button
                    type="button"
                    size="lg"
                    onClick={(event) => {
                      // Combos y productos con partes no se guardan sin color (misma regla del paso a venta).
                      setRevisarColores(true);
                      if (faltanColoresLista.length > 0) return;
                      setIsManualQuoteSubmit(true);
                      event.currentTarget.form?.requestSubmit();
                    }}
                    className="h-11 flex-1 sm:h-9 sm:w-auto sm:flex-none"
                    disabled={!isClientResolved || lines.length === 0}
                  >
                    {submitLabel}
                  </Button>
                </div>
                </div>
              </div>
            )}
            </div>
          </form>
        </div>
      </div>

      <Dialog open={openProductModal} onOpenChange={setOpenProductModal}>
        <DialogContent className="flex max-h-[92vh] w-full max-w-3xl flex-col gap-0 overflow-hidden p-0 max-sm:top-0 max-sm:left-0 max-sm:h-[100dvh] max-sm:max-h-none max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:border-0">
          <DialogHeader className="shrink-0 border-b px-6 py-4 max-sm:px-4">
            <DialogTitle className="inline-flex items-center gap-2">
              <Boxes className="h-4 w-4 text-muted-foreground" />
              <span>{editing ? "Editar producto" : "Agregar producto"}</span>
            </DialogTitle>
          </DialogHeader>

          <div className={`min-h-0 flex-1 overflow-y-auto px-6 py-5 max-sm:px-4 ${CUERPO_CELULAR}`} onFocus={centrarCampoEnCelular}>
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
                <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--primary)]/30 bg-[var(--primary)]/5 p-2.5 sm:flex-nowrap">
                  <ProductThumb
                    src={(editing ? editing.foto : draftProduct?.thumbnailUrl) ?? ""}
                    alt={(editing ? editing.nombre : draftProduct?.name) ?? ""}
                    className="h-12 w-12 shrink-0 rounded-md border border-border object-cover"
                  />
                  <div className="min-w-0 flex-1 max-sm:basis-[calc(100%-3.75rem)]">
                    {/* En edicion el nombre sale de la fila: el producto puede no estar en la lista. */}
                    <p className="break-words text-sm font-semibold text-foreground sm:truncate">
                      {editing ? editing.nombre : draftProduct?.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {(editing ? editing.codigo : draftProduct?.code) || "Sin codigo"}
                    </p>
                  </div>
                  <label className="flex shrink-0 flex-col gap-1 max-sm:ml-auto">
                    <span className="text-[11px] font-medium text-muted-foreground">Cantidad</span>
                    <Input
                      type="number"
                      min={1}
                      value={draftQuantity}
                      onChange={(event) => setDraftQuantity(event.target.value)}
                      className="h-9 w-20 max-sm:w-24"
                    />
                  </label>
                  {!editing ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={clearDraftProductSelection}
                      className="max-sm:size-11 max-sm:self-end"
                      aria-label="Cambiar producto"
                      title="Cambiar producto"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>

                <div className="grid gap-3 rounded-xl border border-border bg-muted/60 p-3 md:grid-cols-2">
                  {draftPartesDef.length > 0 ? (
                    <div className="space-y-1.5 md:col-span-2">
                      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
                        <Palette className="h-3.5 w-3.5 text-muted-foreground" />
                        Color por parte
                      </span>
                      {carta && carta.origen !== "crm" ? (
                        <p className="text-xs text-amber-700 dark:text-amber-400">
                          {carta.origen === "copia"
                            ? "No se pudo leer la carta del CRM. Se muestra la última copia guardada."
                            : "No se pudo leer la carta del CRM. Deja la parte en «Por definir» y elígela después."}
                        </p>
                      ) : null}
                      <PartesColorSelector
                        idPrefix="draft"
                        vistaProductId={draftProductId || undefined}
                        partes={draftPartesDef}
                        carta={carta ? cartaMateriales : null}
                        elegidos={draftPartes}
                        onChange={setDraftPartes}
                      />
                    </div>
                  ) : (
                  <div className="space-y-1.5 md:col-span-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
                        <Palette className="h-3.5 w-3.5 text-muted-foreground" />
                        Color
                        {draftCartaColor ? (
                          <span className="font-normal text-muted-foreground">
                            · {draftCartaColor.codigo} · {draftCartaColor.nombre} ({draftCartaColor.material})
                          </span>
                        ) : null}
                      </span>
                      {cartaMateriales.length > 0 ? (
                        <Button
                          type="button"
                          variant="link"
                          size="sm"
                          className="h-auto min-h-11 px-0"
                          onClick={() => {
                            setManualColor((current) => !current);
                            setDraftCartaColor(null);
                            setDraftColor("");
                          }}
                        >
                          {colorManual ? "Escoger de la carta" : "Escribir otro color"}
                        </Button>
                      ) : null}
                    </div>
                    {carta && carta.origen !== "crm" ? (
                      <p className="text-xs text-amber-700 dark:text-amber-400">
                        {carta.origen === "copia"
                          ? "No se pudo leer la carta del CRM. Se muestra la última copia guardada."
                          : "No se pudo leer la carta del CRM. Escribe el color a mano."}
                      </p>
                    ) : null}
                    {colorManual ? (
                      <Input
                        value={draftColor}
                        onChange={(event) => {
                          setDraftColor(event.target.value);
                          // El color de la carta gana al guardar: al escribir a mano se suelta.
                          setDraftCartaColor(null);
                        }}
                        placeholder="Escribe el color"
                        aria-label="Color"
                      />
                    ) : !carta ? (
                      <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Cargando colores del CRM...
                      </p>
                    ) : (
                      <div className="max-h-64 space-y-3 overflow-y-auto rounded-lg border border-border bg-background p-2">
                        {cartaMateriales.map((material) => (
                          <div key={material.nombre} className="space-y-1.5">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              {material.nombre}
                            </p>
                            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                              {material.colores.map((color) => {
                                const elegido =
                                  draftCartaColor?.codigo === color.codigo &&
                                  draftCartaColor.material === material.nombre;
                                return (
                                  <button
                                    key={`${material.nombre}-${color.codigo}`}
                                    type="button"
                                    aria-pressed={elegido}
                                    onClick={() =>
                                      setDraftCartaColor(elegido ? null : { ...color, material: material.nombre })
                                    }
                                    className={`flex min-h-11 min-w-0 items-center gap-2 rounded-md border p-1.5 text-left text-xs transition-colors ${
                                      elegido
                                        ? "border-primary bg-primary/10 ring-1 ring-primary"
                                        : "border-border hover:bg-muted"
                                    }`}
                                  >
                                    {color.fotoUrl ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img
                                        src={color.fotoUrl}
                                        alt=""
                                        loading="lazy"
                                        className="h-8 w-8 shrink-0 rounded border border-border object-cover"
                                      />
                                    ) : (
                                      <span className="h-8 w-8 shrink-0 rounded border border-dashed border-border bg-muted" />
                                    )}
                                    <span className="min-w-0">
                                      <span className="block font-semibold text-foreground">{color.codigo}</span>
                                      <span className="block break-words text-muted-foreground">{color.nombre}</span>
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  )}

                  {/* En edicion no se cambia: obligaria a volver a escoger las piezas del combo. */}
                  {!editing ? (
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
                  ) : null}

                  {/* Precio solo al editar: al agregar sale del catalogo. Un combo reparte el nuevo precio entre sus piezas. */}
                  {editing ? (
                  <label className="space-y-1.5">
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
                      <Coins className="h-3.5 w-3.5 text-muted-foreground" />
                      Precio
                    </span>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={draftUnitPrice}
                      onChange={(event) => setDraftUnitPrice(event.target.value)}
                    />
                  </label>
                  ) : null}

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
                        {draftImageUrl || (editing ? editing.foto : draftProduct?.thumbnailUrl) ? (
                          <>
                            <ProductThumb
                              src={draftImageUrl || (editing ? editing.foto : draftProduct?.thumbnailUrl) || ""}
                              alt={(editing ? editing.nombre : draftProduct?.name) ?? "Producto"}
                              className="h-full w-full object-cover"
                            />
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/45 text-white opacity-0 transition group-hover:opacity-100 pointer-coarse:inset-x-0 pointer-coarse:top-auto pointer-coarse:flex-row pointer-coarse:py-1 pointer-coarse:opacity-100">
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
                          className="h-auto px-1 py-0 text-xs text-muted-foreground max-sm:min-h-11"
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

                {/* Aviso (no bloquea): combo o kit sin sus piezas cargadas en el catalogo. */}
                {draftProduct &&
                faltanPiezasCombo({
                  code: draftProduct.code,
                  name: draftProduct.name,
                  isBundle: Boolean(draftProduct.isBundle),
                  components: draftProduct.components ?? [],
                }) ? (
                  <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-600 dark:text-amber-400">
                    Este combo no tiene sus piezas cargadas: avisa a quien carga el catálogo.
                  </p>
                ) : null}

              </>
            )}
          </div>

          {draftProductId ? (
            <div className="shrink-0 space-y-3 border-t bg-card px-6 py-4 max-sm:px-4 max-sm:py-3">
              <div className="flex items-center justify-between rounded-xl border border-[var(--primary)]/20 bg-[var(--primary)]/5 px-4 py-3">
                <span className="text-sm font-semibold text-foreground">Total a pagar</span>
                <span className="text-xl font-bold text-[var(--primary)]">
                  {draftLineTotal.toLocaleString("es-CO", { style: "currency", currency })}
                </span>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" size="lg" className="max-sm:h-11" onClick={() => setOpenProductModal(false)}>
                  Cancelar
                </Button>
                <Button type="button" size="lg" className="max-sm:h-11" onClick={editing ? guardarEdicion : addDraftProduct}>
                  {editing ? "Guardar cambios" : "Agregar producto"}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
