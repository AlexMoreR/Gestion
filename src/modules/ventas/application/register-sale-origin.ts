// Caso de uso: el CRM avisa de donde vino el cliente de una cotizacion (al marcar GANADO).
// Gestion lo guarda en la cotizacion y, si la venta ya existe, tambien en la venta. Idempotente:
// un aviso nuevo sobrescribe al anterior (el ultimo GANADO manda).
// Sin Prisma: el acceso a datos entra por el puerto SaleOriginRepository (asi se prueba con mocks).

import {
  type CrmOriginCode,
  type OriginDetail,
  parseOriginNotice,
  phoneMatchKey,
  resolveCrmOrigin,
  type SaleOriginCode,
} from "../domain/sale-origin";

export type QuoteForOrigin = {
  id: string;
  code: string;
  createdAt: Date;
  client: { id: string; isGeneric: boolean }; // isGeneric = "Consumidor final" (cliente compartido)
  sale: { id: string; createdAt: Date } | null;
};

export interface SaleOriginRepository {
  // Busca por varios codigos posibles (canonico primero) y devuelve el primero que exista.
  findQuoteByCodes(codes: string[]): Promise<QuoteForOrigin | null>;
  // Clientes reales (no el generico) cuyo telefono coincide con la clave (ultimos 10 digitos).
  findClientIdsByPhone(phoneKey: string): Promise<string[]>;
  // Hay alguna venta no cancelada de esos clientes creada antes de `before` (sin contar excludeSaleId).
  hasPreviousSales(query: { clientIds: string[]; before: Date; excludeSaleId: string | null }): Promise<boolean>;
  saveOrigin(input: {
    quoteId: string;
    origin: SaleOriginCode;
    originDetail: OriginDetail | null;
  }): Promise<{ saleUpdated: boolean }>;
}

// Regla REFERIDO_RECURRENTE con datos: se mira el cliente de la venta; si es el generico
// ("Consumidor final") no dice nada de la persona, y entonces se cruza por el telefono del chat.
// El telefono solo se usa aqui para decidir; nunca se guarda.
export async function resolveOriginForClient(
  repository: Pick<SaleOriginRepository, "findClientIdsByPhone" | "hasPreviousSales">,
  input: {
    origin: CrmOriginCode;
    client: { id: string; isGeneric: boolean } | null;
    phone: string | null;
    before: Date;
    excludeSaleId: string | null;
  },
): Promise<SaleOriginCode> {
  if (input.origin !== "REFERIDO_RECURRENTE") {
    return resolveCrmOrigin(input.origin, false);
  }

  let clientIds: string[] = [];
  if (input.client && !input.client.isGeneric) {
    clientIds = [input.client.id];
  } else {
    const key = phoneMatchKey(input.phone);
    clientIds = key ? await repository.findClientIdsByPhone(key) : [];
  }

  const hasPrevious =
    clientIds.length > 0 &&
    (await repository.hasPreviousSales({ clientIds, before: input.before, excludeSaleId: input.excludeSaleId }));
  return resolveCrmOrigin(input.origin, hasPrevious);
}

export type RegisterSaleOriginResult =
  | { status: 200; body: { ok: true; quoteCode: string; origin: SaleOriginCode; saleUpdated: boolean } }
  | { status: 400; body: { error: "datos_invalidos" } }
  | { status: 404; body: { error: "cotizacion_no_existe" } };

export async function registerSaleOriginUseCase(
  repository: SaleOriginRepository,
  body: unknown,
): Promise<RegisterSaleOriginResult> {
  const parsed = parseOriginNotice(body);
  if (!parsed.ok) {
    return { status: 400, body: { error: "datos_invalidos" } };
  }
  const { notice } = parsed;

  const quote = await repository.findQuoteByCodes(notice.quoteCodes);
  if (!quote) {
    return { status: 404, body: { error: "cotizacion_no_existe" } };
  }

  // "Venta previa" = anterior a esta venta (si ya existe) o a esta cotizacion, sin contar la propia.
  const origin = await resolveOriginForClient(repository, {
    origin: notice.origin,
    client: quote.client,
    phone: notice.contactPhone,
    before: quote.sale?.createdAt ?? quote.createdAt,
    excludeSaleId: quote.sale?.id ?? null,
  });

  const { saleUpdated } = await repository.saveOrigin({
    quoteId: quote.id,
    origin,
    originDetail: notice.originDetail,
  });

  return { status: 200, body: { ok: true, quoteCode: quote.code, origin, saleUpdated } };
}
