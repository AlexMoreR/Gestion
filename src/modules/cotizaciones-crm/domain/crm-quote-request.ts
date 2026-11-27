// Cotizacion creada desde el CRM (AizenCRM): POST /api/cotizaciones. Reglas puras, sin Prisma.
//
// El CRM manda los datos del cliente que junto la asesora en la ficha del chat y los productos con
// cantidad. Gestion NO acepta precios del CRM: cada linea se cotiza con el precio actual del
// producto en Gestion (los combos se reparten entre sus componentes, igual que el admin).
// Si falta algo obligatorio se responde 422 con la lista "missing" y no se crea nada.

import { z } from "zod";

import { expandComboLines, type ComboComponent } from "../../../lib/combo";
import { calculateQuoteLineTotal, stringifyQuoteItemMeta } from "../../../lib/quote-item-meta";
import { CRM_ORIGINS, type CrmOriginCode, phoneDigits } from "../../ventas/domain/sale-origin";

export type MissingField = { campo: string; mensaje: string };

export type CrmQuoteAdicional = { descripcion: string; valor: number };

// unitPrice, color y adicionales son opcionales y por ahora solo los usa quien arma la cotizacion
// dictada (parte 2); parseCrmQuoteRequest no los lee: el CRM sigue sin poder mandar precios.
export type CrmQuoteItemRef = {
  productCode: string | null;
  productId: string | null;
  quantity: number;
  /** Precio dictado por unidad (COP). Sin el, se usa el precio de Gestion. */
  unitPrice?: number;
  color?: string;
  adicionales?: CrmQuoteAdicional[];
};

export type CrmQuoteRequest = {
  client: {
    name: string;
    document: string;
    email: string | null;
    phone: string;
    city: string;
    department: string;
    address: string;
    neighborhood: string | null;
  };
  items: CrmQuoteItemRef[];
  asesoraEmail: string | null;
  origin: CrmOriginCode | null;
  linea: string | null;
  crmConversationId: string | null;
  crmContactId: string | null;
  notes: string | null;
};

const MAX_QUANTITY = 10_000;

// Todo llega como texto opcional: la validacion fina (y sus mensajes) se hace a mano para poder
// devolver TODO lo que falta de una vez, en palabras simples para la asesora.
const optionalText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === "number" && Number.isFinite(value) ? String(value) : value),
    z.string().max(max).nullish(),
  );

const bodySchema = z.object({
  client: z
    .object({
      fullName: optionalText(200),
      document: optionalText(60),
      email: optionalText(200),
      phone: optionalText(60),
      city: optionalText(200),
      department: optionalText(200),
      address: optionalText(300),
      neighborhood: optionalText(200),
    })
    .nullish(),
  items: z
    .array(
      z.object({
        productCode: optionalText(120),
        productId: optionalText(120),
        quantity: z.unknown().optional(),
      }),
    )
    .max(100)
    .nullish(),
  asesoraEmail: optionalText(200),
  origin: z.string().max(40).nullish(),
  linea: optionalText(120),
  crmConversationId: optionalText(120),
  crmContactId: optionalText(120),
  notes: optionalText(2000),
});

function clean(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseQuantity(raw: unknown): number | null {
  const value = typeof raw === "string" && raw.trim() ? Number(raw.trim()) : raw;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > MAX_QUANTITY) {
    return null;
  }
  return value;
}

// Linea de WhatsApp del chat -> origen (decision 7-oct-2026, ver ventas/domain/sale-origin.ts):
// Ventas 1 = META_ADS · Ventas 2 = MARKETPLACE · Admin = REFERIDO_RECURRENTE (lo resuelve Gestion).
export function originFromLinea(linea: string | null | undefined): CrmOriginCode | null {
  const key = (linea ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (key === "ventas1") return "META_ADS";
  if (key === "ventas2") return "MARKETPLACE";
  if (key === "admin") return "REFERIDO_RECURRENTE";
  return null;
}

function parseOrigin(raw: unknown): CrmOriginCode | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().toUpperCase();
  return (CRM_ORIGINS as readonly string[]).includes(value) ? (value as CrmOriginCode) : null;
}

export function parseCrmQuoteRequest(
  body: unknown,
): { ok: true; request: CrmQuoteRequest } | { ok: false; missing: MissingField[] } {
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, missing: [{ campo: "body", mensaje: "Los datos enviados no tienen el formato esperado" }] };
  }
  const data = parsed.data;
  const missing: MissingField[] = [];
  const client = data.client ?? {};

  const name = clean(client.fullName);
  const document = clean(client.document);
  const emailRaw = clean(client.email).toLowerCase();
  const phone = clean(client.phone);
  const city = clean(client.city);
  const department = clean(client.department);
  const address = clean(client.address);

  if (name.length < 2) missing.push({ campo: "fullName", mensaje: "Falta el nombre completo del cliente" });
  if (!document) missing.push({ campo: "document", mensaje: "Falta la cédula o NIT del cliente" });
  if (emailRaw && !EMAIL_RE.test(emailRaw)) missing.push({ campo: "email", mensaje: "El correo del cliente no es válido" });
  if (phoneDigits(phone).length < 7) missing.push({ campo: "phone", mensaje: "Falta el teléfono del cliente" });
  if (city.length < 2) missing.push({ campo: "city", mensaje: "Falta la ciudad" });
  if (department.length < 2) missing.push({ campo: "department", mensaje: "Falta el departamento" });
  if (address.length < 5) missing.push({ campo: "address", mensaje: "Falta la dirección de entrega completa" });

  const items: CrmQuoteItemRef[] = [];
  const rawItems = data.items ?? [];
  if (rawItems.length === 0) {
    missing.push({ campo: "items", mensaje: "Falta al menos un producto con su cantidad" });
  }
  rawItems.forEach((item, index) => {
    const productCode = clean(item.productCode) || null;
    const productId = clean(item.productId) || null;
    const quantity = parseQuantity(item.quantity);
    const label = productCode ?? `#${index + 1}`;
    if (!productCode && !productId) {
      missing.push({ campo: `items[${index}].producto`, mensaje: `El producto ${index + 1} no tiene código de Gestión` });
    }
    if (quantity === null) {
      missing.push({ campo: `items[${index}].quantity`, mensaje: `Falta la cantidad del producto ${label}` });
    }
    if ((productCode || productId) && quantity !== null) {
      items.push({ productCode, productId, quantity });
    }
  });

  if (missing.length > 0) {
    return { ok: false, missing };
  }

  const linea = clean(data.linea) || null;
  return {
    ok: true,
    request: {
      client: {
        name,
        document,
        email: emailRaw || null,
        phone,
        city,
        department,
        address,
        neighborhood: clean(client.neighborhood) || null,
      },
      items,
      asesoraEmail: clean(data.asesoraEmail).toLowerCase() || null,
      origin: parseOrigin(data.origin) ?? originFromLinea(linea),
      linea,
      crmConversationId: clean(data.crmConversationId) || null,
      crmContactId: clean(data.crmContactId) || null,
      notes: data.notes?.trim() || null,
    },
  };
}

// --- Productos ---

export type ProductForQuote = {
  id: string;
  code: string | null;
  name: string;
  price: number;
  isBundle: boolean;
  components: ComboComponent[];
};

function refLabel(ref: CrmQuoteItemRef): string {
  return ref.productCode ?? ref.productId ?? "?";
}

export type MatchedQuoteItem = { product: ProductForQuote; quantity: number } & Pick<
  CrmQuoteItemRef,
  "unitPrice" | "color" | "adicionales"
>;

// Cruza cada linea con el producto de Gestion (por id o por codigo, sin distinguir mayusculas).
export function matchProducts(
  items: CrmQuoteItemRef[],
  products: ProductForQuote[],
): { ok: true; matched: MatchedQuoteItem[] } | { ok: false; missing: MissingField[] } {
  const byId = new Map(products.map((product) => [product.id, product]));
  const byCode = new Map(
    products.filter((product) => product.code).map((product) => [product.code!.trim().toUpperCase(), product]),
  );
  const missing: MissingField[] = [];
  const matched: MatchedQuoteItem[] = [];

  items.forEach((item, index) => {
    const product =
      (item.productId ? byId.get(item.productId) : undefined) ??
      (item.productCode ? byCode.get(item.productCode.trim().toUpperCase()) : undefined);
    if (!product) {
      missing.push({ campo: `items[${index}].producto`, mensaje: `El producto ${refLabel(item)} no existe en Gestión` });
      return;
    }
    if (!(product.price > 0)) {
      missing.push({ campo: `items[${index}].precio`, mensaje: `El producto ${product.name} no tiene precio en Gestión` });
      return;
    }
    if (product.isBundle && !product.components.some((component) => component.quantity > 0)) {
      missing.push({ campo: `items[${index}].producto`, mensaje: `El combo ${product.name} no tiene componentes en Gestión` });
      return;
    }
    // Los campos dictados solo se copian si vienen: sin ellos la salida es la de siempre.
    matched.push({
      product,
      quantity: item.quantity,
      ...(item.unitPrice !== undefined ? { unitPrice: item.unitPrice } : {}),
      ...(item.color !== undefined ? { color: item.color } : {}),
      ...(item.adicionales !== undefined ? { adicionales: item.adicionales } : {}),
    });
  });

  return missing.length > 0 ? { ok: false, missing } : { ok: true, matched };
}

export type QuoteLine = {
  productId: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  notes: string | null;
  // Solo con un precio dictado menor que el de Gestion (en un combo, precioGestion es el del combo).
  precioMenor?: true;
  precioGestion?: number;
};

// Lineas con el precio actual de Gestion (o el dictado, por unidad, si vino). Un combo se expande en
// sus componentes (como el admin): el precio del combo se reparte y todas las lineas comparten
// comboKey/nombre/codigo. Color y adicionales van en las notas como las guarda la pantalla: la suma
// de los adicionales en additionalCost (en un combo, completa en la primera pieza) y sus
// descripciones en description.
export function buildQuoteLines(
  matched: MatchedQuoteItem[],
  newComboKey: () => string,
): { lines: QuoteLine[]; subtotal: number; total: number } {
  const lines: QuoteLine[] = [];
  for (const { product, quantity, unitPrice: dictado, color: colorRaw, adicionales: adicionalesRaw } of matched) {
    const price = typeof dictado === "number" && Number.isFinite(dictado) && dictado > 0 ? dictado : product.price;
    const aviso = price < product.price ? { precioMenor: true as const, precioGestion: product.price } : {};
    const color = colorRaw?.trim() ?? "";
    const adicionales = (adicionalesRaw ?? []).filter(
      (a) => a.descripcion?.trim() && Number.isFinite(a.valor) && a.valor > 0,
    );
    const additionalCost = Number(adicionales.reduce((sum, a) => sum + a.valor, 0).toFixed(2));
    const description = adicionales.map((a) => a.descripcion.trim()).join(" · ");
    const extras = { color, additionalCost, description };

    if (product.isBundle) {
      const comboKey = newComboKey();
      expandComboLines(product.components, quantity, price).forEach((line, index) => {
        const lineExtras = index === 0 ? extras : { color };
        lines.push({
          productId: line.productId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          lineTotal: calculateQuoteLineTotal(line.quantity, line.unitPrice, index === 0 ? additionalCost : 0),
          notes: stringifyQuoteItemMeta({
            ...lineExtras,
            comboKey,
            comboName: product.name,
            comboCode: product.code ?? "",
            comboQuantity: quantity,
          }),
          ...aviso,
        });
      });
      continue;
    }
    lines.push({
      productId: product.id,
      quantity,
      unitPrice: price,
      lineTotal: calculateQuoteLineTotal(quantity, price, additionalCost),
      notes: stringifyQuoteItemMeta(extras),
      ...aviso,
    });
  }
  const subtotal = Number(lines.reduce((sum, line) => sum + line.lineTotal, 0).toFixed(2));
  return { lines, subtotal, total: subtotal };
}

// --- Idempotencia ---

export const IDEMPOTENCY_WINDOW_MS = 10 * 60 * 1000;

// Clave estable de los productos pedidos (orden y repetidos no importan): "id:cant|id:cant".
export function buildItemsKey(matched: { product: { id: string }; quantity: number }[]): string {
  const totals = new Map<string, number>();
  for (const { product, quantity } of matched) {
    totals.set(product.id, (totals.get(product.id) ?? 0) + quantity);
  }
  return [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, quantity]) => `${id}:${quantity}`)
    .join("|");
}
