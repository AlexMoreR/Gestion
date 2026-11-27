// Caso de uso: cotizacion dictada por chat o voz a Claude (conector MCP de Gestion).
// Dos pasos, como registrar_gasto: prepareChatQuote solo arma el resumen (NUNCA crea nada) y
// confirmChatQuote, despues del "si", crea la cotizacion en Borrador a nombre de la asesora.
// Sin Prisma: los datos entran por el puerto ChatQuoteRepository (se prueba con un repositorio falso).
// A diferencia del CRM, aqui SI se acepta un precio dictado por producto (con aviso si es menor).

import {
  buildItemsKey,
  buildQuoteLines,
  type CrmQuoteAdicional,
  IDEMPOTENCY_WINDOW_MS,
  type MatchedQuoteItem,
  matchProducts,
  type MissingField,
  parseCrmQuoteRequest,
  type CrmQuoteRequest,
} from "../domain/crm-quote-request";
import type { CrmQuoteRepository, StaffUser } from "./create-crm-quote";

export type ChatQuoteClient = CrmQuoteRequest["client"];

export type ExistingChatQuote = { id: string; code: string; total: number; shareToken: string; itemsKey: string | null };

// Solo lo que necesita el chat; findProducts/upsertClient/createQuote/logCreated son los del CRM.
export interface ChatQuoteRepository
  extends Pick<CrmQuoteRepository, "findProducts" | "upsertClient" | "createQuote" | "logCreated"> {
  // Busca al cliente como la pantalla (correo, documento, telefono) SIN modificarlo.
  findClient(client: ChatQuoteClient): Promise<{ id: string } | null>;
  // Todo el equipo (solo ADMIN o EMPLEADO).
  listStaff(): Promise<StaffUser[]>;
  // Cotizaciones del cliente creadas por chat desde `since` (originDetail.canal = "MCP").
  findRecentChatQuotes(clientId: string, since: Date): Promise<ExistingChatQuote[]>;
}

export type ChatQuoteDeps = {
  repository: ChatQuoteRepository;
  shareUrl: (shareToken: string) => string;
  pdfUrl: (shareToken: string) => string;
  now?: () => Date;
  newComboKey: () => string;
};

export type ChatQuoteInput = {
  cliente: {
    nombre?: string | null;
    documento?: string | null;
    direccion?: string | null;
    telefono?: string | null;
    ciudad?: string | null;
    departamento?: string | null;
    correo?: string | null;
    barrio?: string | null;
  };
  ciudadEntrega?: string | null;
  productos: { codigo: string; cantidad: number; color?: string | null; precio?: number | null }[];
  adicionales?: { descripcion: string; valor: number; productoCodigo?: string | null }[];
  observaciones?: string | null;
  asesora: string;
};

export type ChatQuoteError = {
  ok: false;
  error: string;
  missing?: MissingField[];
  // Con una asesora que no aparece o que comparten varias: los nombres del equipo para elegir.
  asesoras?: string[];
};

export type ChatQuoteSummary = {
  ok: true;
  cliente: ChatQuoteClient & { estado: string };
  ciudadEntrega: string;
  productos: {
    codigo: string | null;
    nombre: string;
    cantidad: number;
    color: string | null;
    precioDictado: number | null;
    precioGestion: number;
    aviso: string | null;
  }[];
  adicionales: { descripcion: string; valor: number; producto: string }[];
  observaciones: string | null;
  asesora: string;
  total: number;
};

export type ChatQuoteCreated = {
  ok: true;
  reused: boolean;
  code: string;
  shareToken: string;
  shareUrl: string;
  pdfUrl: string;
  total: number;
};

export function normalizeName(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Nombre exacto (sin tildes ni mayusculas); si no, el nombre que tenga esas palabras completas.
// Cero o varias coincidencias = no se adivina.
export function findAsesora(staff: StaffUser[], asesora: string): StaffUser | ChatQuoteError {
  const query = normalizeName(asesora);
  const names = [...new Set(staff.map((user) => user.name?.trim() || user.email))].sort((a, b) => a.localeCompare(b));
  if (!query) return { ok: false, error: "Falta la asesora", asesoras: names };
  const exact = staff.filter((user) => normalizeName(user.name) === query);
  const words = query.split(" ");
  const partial = exact.length
    ? exact
    : staff.filter((user) => {
        const own = normalizeName(user.name).split(" ");
        return words.every((word) => own.includes(word));
      });
  if (partial.length === 1) return partial[0];
  return {
    ok: false,
    error: partial.length === 0 ? `No encontré a la asesora "${asesora}"` : `Hay varias personas con el nombre "${asesora}"`,
    asesoras: names,
  };
}

type Validated = {
  client: ChatQuoteClient;
  ciudadEntrega: string;
  matched: MatchedQuoteItem[];
  adicionales: ChatQuoteSummary["adicionales"];
  observaciones: string | null;
  asesora: StaffUser;
};

async function validate(deps: ChatQuoteDeps, input: ChatQuoteInput): Promise<Validated | ChatQuoteError> {
  const productos = Array.isArray(input.productos) ? input.productos : [];
  const parsed = parseCrmQuoteRequest({
    client: {
      fullName: input.cliente?.nombre,
      document: input.cliente?.documento,
      email: input.cliente?.correo,
      phone: input.cliente?.telefono,
      city: input.cliente?.ciudad,
      department: input.cliente?.departamento,
      address: input.cliente?.direccion,
      neighborhood: input.cliente?.barrio,
    },
    items: productos.map((p) => ({ productCode: p.codigo, quantity: p.cantidad })),
    notes: input.observaciones,
  });
  if (!parsed.ok) return { ok: false, error: "Faltan datos", missing: parsed.missing };

  const missing: MissingField[] = [];
  // parseCrmQuoteRequest no deja pasar ninguna linea invalida: items[i] es productos[i].
  const items = parsed.request.items.map((item, index) => {
    const { color, precio } = productos[index];
    if (precio !== undefined && precio !== null && !(typeof precio === "number" && Number.isFinite(precio) && precio > 0)) {
      missing.push({ campo: `productos[${index}].precio`, mensaje: `El precio del producto ${item.productCode} no es válido` });
    }
    return {
      ...item,
      ...(typeof precio === "number" && precio > 0 ? { unitPrice: precio } : {}),
      ...(color?.trim() ? { color: color.trim() } : {}),
      adicionales: [] as CrmQuoteAdicional[],
    };
  });

  const adicionales: ChatQuoteSummary["adicionales"] = [];
  (input.adicionales ?? []).forEach((adicional, index) => {
    const descripcion = adicional.descripcion?.trim() ?? "";
    if (!descripcion || !(Number.isFinite(adicional.valor) && adicional.valor > 0)) {
      missing.push({ campo: `adicionales[${index}]`, mensaje: `El adicional ${index + 1} necesita descripción y valor` });
      return;
    }
    const code = adicional.productoCodigo?.trim().toUpperCase();
    const item = code ? items.find((it) => it.productCode?.trim().toUpperCase() === code) : items[0];
    if (!item) {
      missing.push({ campo: `adicionales[${index}].productoCodigo`, mensaje: `El adicional "${descripcion}" va en ${code}, que no está en la cotización` });
      return;
    }
    item.adicionales.push({ descripcion, valor: adicional.valor });
    adicionales.push({ descripcion, valor: adicional.valor, producto: item.productCode ?? "" });
  });
  if (missing.length > 0) return { ok: false, error: "Faltan datos", missing };

  const products = await deps.repository.findProducts({
    ids: [],
    codes: items.flatMap((item) => (item.productCode ? [item.productCode] : [])),
  });
  const match = matchProducts(items, products);
  if (!match.ok) return { ok: false, error: "Hay productos que no se pueden cotizar", missing: match.missing };

  const asesora = findAsesora(await deps.repository.listStaff(), input.asesora);
  if ("ok" in asesora) return asesora;

  return {
    client: parsed.request.client,
    ciudadEntrega: input.ciudadEntrega?.trim() || parsed.request.client.city,
    matched: match.matched,
    adicionales,
    observaciones: parsed.request.notes,
    asesora,
  };
}

// Paso 1: resumen para repetirle al dueno. No escribe nada.
export async function prepareChatQuote(deps: ChatQuoteDeps, input: ChatQuoteInput): Promise<ChatQuoteSummary | ChatQuoteError> {
  const valid = await validate(deps, input);
  if ("ok" in valid) return valid;
  const existing = await deps.repository.findClient(valid.client);
  const { total } = buildQuoteLines(valid.matched, () => "resumen");
  return {
    ok: true,
    cliente: { ...valid.client, estado: existing ? "cliente existente: se actualizarán sus datos" : "cliente nuevo" },
    ciudadEntrega: valid.ciudadEntrega,
    productos: valid.matched.map(({ product, quantity, unitPrice, color }) => ({
      codigo: product.code,
      nombre: product.name,
      cantidad: quantity,
      color: color ?? null,
      precioDictado: unitPrice ?? null,
      precioGestion: product.price,
      aviso:
        unitPrice !== undefined && unitPrice < product.price
          ? `Precio dictado menor que el de Gestión (${product.price})`
          : null,
    })),
    adicionales: valid.adicionales,
    observaciones: valid.observaciones,
    asesora: valid.asesora.name?.trim() || valid.asesora.email,
    total,
  };
}

// Paso 2: despues del "si". Una segunda confirmacion igual en 10 minutos devuelve la misma COT.
export async function confirmChatQuote(deps: ChatQuoteDeps, input: ChatQuoteInput): Promise<ChatQuoteCreated | ChatQuoteError> {
  const valid = await validate(deps, input);
  if ("ok" in valid) return valid;

  const itemsKey = buildItemsKey(valid.matched);
  const now = deps.now?.() ?? new Date();
  const existing = await deps.repository.findClient(valid.client);
  if (existing) {
    const recent = await deps.repository.findRecentChatQuotes(existing.id, new Date(now.getTime() - IDEMPOTENCY_WINDOW_MS));
    const same = recent.find((quote) => quote.itemsKey === itemsKey);
    if (same) {
      return {
        ok: true,
        reused: true,
        code: same.code,
        shareToken: same.shareToken,
        shareUrl: deps.shareUrl(same.shareToken),
        pdfUrl: deps.pdfUrl(same.shareToken),
        total: same.total,
      };
    }
  }

  const clientId = await deps.repository.upsertClient(valid.client);
  const { lines, subtotal, total } = buildQuoteLines(valid.matched, deps.newComboKey);
  const quote = await deps.repository.createQuote({
    clientId,
    createdById: valid.asesora.id,
    notes: valid.observaciones,
    lines,
    subtotal,
    total,
    origin: null,
    originDetail: { canal: "MCP", itemsKey, ciudadEntrega: valid.ciudadEntrega },
  });
  await deps.repository.logCreated(valid.asesora, quote, "MCP");

  return {
    ok: true,
    reused: false,
    code: quote.code,
    shareToken: quote.shareToken,
    shareUrl: deps.shareUrl(quote.shareToken),
    pdfUrl: deps.pdfUrl(quote.shareToken),
    total,
  };
}
