// Caso de uso: el CRM pide crear una cotizacion (boton "Generar cotizacion" de la ficha del chat).
// Sin Prisma: los datos entran por el puerto CrmQuoteRepository (se prueba con mocks).

import { type CrmOriginCode, resolveCrmOrigin, type SaleOriginCode } from "../../ventas/domain/sale-origin";

import {
  buildItemsKey,
  buildQuoteLines,
  IDEMPOTENCY_WINDOW_MS,
  matchProducts,
  type MissingField,
  parseCrmQuoteRequest,
  type ProductForQuote,
  type QuoteLine,
} from "../domain/crm-quote-request";

export type StaffUser = { id: string; name: string | null; email: string };

export type ExistingCrmQuote = { id: string; code: string; total: number; shareToken: string; itemsKey: string | null };

export interface CrmQuoteRepository {
  findProducts(refs: { ids: string[]; codes: string[] }): Promise<ProductForQuote[]>;
  // Cotizaciones del mismo chat creadas desde `since` (la mas nueva primero).
  findRecentByConversation(crmConversationId: string, since: Date): Promise<ExistingCrmQuote[]>;
  // Solo ADMIN o EMPLEADO (nunca un cliente).
  findStaffByEmail(email: string): Promise<StaffUser | null>;
  findFirstAdmin(): Promise<StaffUser | null>;
  upsertClient(client: {
    name: string;
    document: string;
    email: string | null;
    phone: string;
    city: string;
    department: string;
    address: string;
    neighborhood: string | null;
  }): Promise<string>;
  hasPreviousSales(clientId: string): Promise<boolean>;
  createQuote(input: {
    clientId: string;
    createdById: string;
    notes: string | null;
    lines: QuoteLine[];
    subtotal: number;
    total: number;
    origin: SaleOriginCode | null;
    originDetail: Record<string, string>;
  }): Promise<{ id: string; code: string; shareToken: string }>;
  logCreated(actor: StaffUser, quote: { id: string; code: string }): Promise<void>;
}

export type CrmQuoteDeps = {
  repository: CrmQuoteRepository;
  shareUrl: (shareToken: string) => string;
  pdfUrl: (shareToken: string) => string;
  systemUserEmail?: string | null;
  now?: () => Date;
  newComboKey: () => string;
};

export type CrmQuoteResult =
  | { status: 422; body: { ok: false; missing: MissingField[] } }
  | { status: 500; body: { ok: false; error: string } }
  | {
      status: 200 | 201;
      body: {
        ok: true;
        reused: boolean;
        quoteId: string;
        code: string;
        total: number;
        shareUrl: string;
        pdfUrl: string;
        createdBy: { email: string; fallback: boolean } | null;
        missing: MissingField[];
      };
    };

async function resolveCreatedBy(
  deps: CrmQuoteDeps,
  asesoraEmail: string | null,
): Promise<{ user: StaffUser; fallback: boolean } | null> {
  if (asesoraEmail) {
    const user = await deps.repository.findStaffByEmail(asesoraEmail);
    if (user) return { user, fallback: false };
  }
  const systemEmail = deps.systemUserEmail?.trim().toLowerCase();
  if (systemEmail) {
    const user = await deps.repository.findStaffByEmail(systemEmail);
    if (user) return { user, fallback: true };
  }
  const admin = await deps.repository.findFirstAdmin();
  return admin ? { user: admin, fallback: true } : null;
}

export async function createCrmQuoteUseCase(deps: CrmQuoteDeps, body: unknown): Promise<CrmQuoteResult> {
  const parsed = parseCrmQuoteRequest(body);
  if (!parsed.ok) {
    return { status: 422, body: { ok: false, missing: parsed.missing } };
  }
  const request = parsed.request;

  const products = await deps.repository.findProducts({
    ids: request.items.flatMap((item) => (item.productId ? [item.productId] : [])),
    codes: request.items.flatMap((item) => (item.productCode ? [item.productCode] : [])),
  });
  const match = matchProducts(request.items, products);
  if (!match.ok) {
    return { status: 422, body: { ok: false, missing: match.missing } };
  }

  const itemsKey = buildItemsKey(match.matched);
  const now = deps.now?.() ?? new Date();

  if (request.crmConversationId) {
    const recent = await deps.repository.findRecentByConversation(
      request.crmConversationId,
      new Date(now.getTime() - IDEMPOTENCY_WINDOW_MS),
    );
    const same = recent.find((quote) => quote.itemsKey === itemsKey);
    if (same) {
      return {
        status: 200,
        body: {
          ok: true,
          reused: true,
          quoteId: same.id,
          code: same.code,
          total: same.total,
          shareUrl: deps.shareUrl(same.shareToken),
          pdfUrl: deps.pdfUrl(same.shareToken),
          createdBy: null,
          missing: [],
        },
      };
    }
  }

  const createdBy = await resolveCreatedBy(deps, request.asesoraEmail);
  if (!createdBy) {
    return { status: 500, body: { ok: false, error: "sin_usuario_creador" } };
  }

  const clientId = await deps.repository.upsertClient(request.client);
  const { lines, subtotal, total } = buildQuoteLines(match.matched, deps.newComboKey);

  let origin: SaleOriginCode | null = null;
  if (request.origin) {
    const crmOrigin: CrmOriginCode = request.origin;
    const hasPrevious = crmOrigin === "REFERIDO_RECURRENTE" ? await deps.repository.hasPreviousSales(clientId) : false;
    origin = resolveCrmOrigin(crmOrigin, hasPrevious);
  }

  // Detalle guardado en la cotizacion (mismo Json que usa /api/ventas/origen). Nunca telefonos.
  const originDetail: Record<string, string> = { via: "cotizacion", crmItemsKey: itemsKey };
  if (request.linea) originDetail.linea = request.linea;
  if (request.crmConversationId) originDetail.crmConversationId = request.crmConversationId;
  if (request.crmContactId) originDetail.crmContactId = request.crmContactId;

  const quote = await deps.repository.createQuote({
    clientId,
    createdById: createdBy.user.id,
    notes: request.notes,
    lines,
    subtotal,
    total,
    origin,
    originDetail,
  });
  await deps.repository.logCreated(createdBy.user, quote);

  return {
    status: 201,
    body: {
      ok: true,
      reused: false,
      quoteId: quote.id,
      code: quote.code,
      total,
      shareUrl: deps.shareUrl(quote.shareToken),
      pdfUrl: deps.pdfUrl(quote.shareToken),
      createdBy: { email: createdBy.user.email, fallback: createdBy.fallback },
      missing: [],
    },
  };
}
