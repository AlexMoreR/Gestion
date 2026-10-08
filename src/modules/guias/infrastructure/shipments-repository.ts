import "server-only";
import { randomBytes } from "node:crypto";
import { Prisma, type DispatchStatus, type ShipmentIncident, type ShipmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizePlaceName, resolveShippingType } from "@/modules/transporte/domain/shipping";
import {
  suggestAmountToCollect,
  type CollectSuggestion,
  type SalePaymentMethod,
} from "@/modules/ventas/domain/payment-method";
import { aliasCityCode, rankPlaces } from "@/modules/transporte/domain/place-search";
import { ensureTransportSeed } from "@/modules/transporte/infrastructure/transporte-repository";
import { generateUniqueShipmentCode } from "../domain/codes";
import { BOGOTA_CITY_CODE, estimateDelivery } from "../domain/eta";
import { phoneLast4 } from "../domain/lookup";
import type { CityOption } from "../domain/types";
import {
  canCarrierMoveTo,
  canMagilusMoveTo,
  dispatchStatusForShipment,
  isFinalShipmentStatus,
  SHIPMENT_STATUS_LABEL,
} from "../domain/statuses";

// Error con mensaje para mostrar al usuario (las acciones lo devuelven tal cual).
export class ShipmentError extends Error {}

export type { CityOption };

const citySelect = { id: true, name: true, code: true, department: { select: { name: true } } } as const;

function toCityOption(city: { id: string; name: string; code: string; department: { name: string } }): CityOption {
  return { id: city.id, name: city.name, code: city.code, departmentName: city.department.name };
}

// Enlace del transportador: 192 bits aleatorios (mismo patron que las ordenes de fabricacion).
export function generateCarrierToken(): string {
  return randomBytes(24).toString("base64url");
}

// --- Ciudades (catalogo DANE del modulo Transporte) ---

// Busca solo municipios (TransportCity) con el mismo ranking del buscador de ubicaciones.
export async function searchShipmentCities(term: string, limit = 12): Promise<CityOption[]> {
  const query = term.trim();
  const key = normalizePlaceName(query);
  if (key.length < 2) {
    return [];
  }
  await ensureTransportSeed();
  const alias = aliasCityCode(key);
  const insensitive = "insensitive" as const;
  const [aliasCities, matches] = await Promise.all([
    alias ? prisma.transportCity.findMany({ where: { code: alias }, take: 1, select: citySelect }) : Promise.resolve([]),
    prisma.transportCity.findMany({
      where: { OR: [{ nameKey: { contains: key } }, { name: { contains: query, mode: insensitive } }] },
      orderBy: { name: "asc" },
      take: 80,
      select: { ...citySelect, nameKey: true },
    }),
  ]);
  const unique = Array.from(
    new Map([...aliasCities, ...matches].map((city) => [city.id, { ...city, kind: "city" as const }])).values(),
  );
  return rankPlaces(unique, query, limit).map(toCityOption);
}

export async function findCityOption(cityId: string | null | undefined): Promise<CityOption | null> {
  if (!cityId) {
    return null;
  }
  const city = await prisma.transportCity.findUnique({ where: { id: cityId }, select: citySelect });
  return city ? toCityOption(city) : null;
}

// Sugiere la ciudad destino a partir del texto libre del cliente (User.city / department).
export async function resolveCityFromClient(
  cityText: string | null | undefined,
  departmentText: string | null | undefined,
): Promise<CityOption | null> {
  const key = normalizePlaceName(cityText ?? "");
  if (key.length < 2) {
    return null;
  }
  await ensureTransportSeed();
  const alias = aliasCityCode(key);
  if (alias) {
    const city = await prisma.transportCity.findUnique({ where: { code: alias }, select: citySelect });
    if (city) {
      return toCityOption(city);
    }
  }
  const candidates = await prisma.transportCity.findMany({
    where: { OR: [{ nameKey: key }, { name: { equals: (cityText ?? "").trim(), mode: "insensitive" } }] },
    take: 10,
    select: citySelect,
  });
  if (candidates.length === 0) {
    return null;
  }
  const departmentKey = normalizePlaceName(departmentText ?? "");
  const byDepartment = departmentKey
    ? candidates.find((city) => normalizePlaceName(city.department.name).includes(departmentKey))
    : undefined;
  // Si el nombre se repite en varios departamentos y no sabemos cual, no adivinamos.
  if (!byDepartment && candidates.length > 1) {
    return null;
  }
  return toCityOption(byDepartment ?? candidates[0]);
}

async function getBogotaCityId(): Promise<string | null> {
  await ensureTransportSeed();
  const city = await prisma.transportCity.findUnique({ where: { code: BOGOTA_CITY_CODE }, select: { id: true } });
  return city?.id ?? null;
}

// --- Saldo de la venta (igual que /sales/[token]: lineas de la cotizacion - pagos) ---

export async function computeSaleBalance(saleId: string | null | undefined): Promise<number> {
  if (!saleId) {
    return 0;
  }
  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    select: {
      downPaymentAmount: true,
      quote: { select: { items: { select: { lineTotal: true } } } },
      salePayments: { select: { amount: true } },
    },
  });
  if (!sale) {
    return 0;
  }
  const capital = sale.quote.items.reduce((sum, item) => sum + Number(item.lineTotal), 0);
  const paid =
    sale.salePayments.length > 0
      ? sale.salePayments.reduce((sum, payment) => sum + Math.max(0, Number(payment.amount)), 0)
      : Number(sale.downPaymentAmount);
  return Math.max(Math.round(capital - paid), 0);
}

// Cobro al recibir sugerido segun la forma de pago de la venta: con contraentrega suma el envio
// (Bogota $100.000, ciudades GRATIS $150.000, otras se cotizan); con 50/50 es el saldo (lo
// esperado es $0). Siempre editable al crear la guia.
export async function computeCollectSuggestion(
  saleId: string | null | undefined,
  destinationCityId: string | null | undefined,
): Promise<CollectSuggestion & { paymentMethod: SalePaymentMethod | null }> {
  const [saleBalance, sale, city] = await Promise.all([
    computeSaleBalance(saleId),
    saleId ? prisma.sale.findUnique({ where: { id: saleId }, select: { paymentMethod: true } }) : Promise.resolve(null),
    destinationCityId
      ? prisma.transportCity.findUnique({
          where: { id: destinationCityId },
          select: { code: true, shippingType: true, freeShipping: true },
        })
      : Promise.resolve(null),
  ]);
  const paymentMethod = sale?.paymentMethod ?? null;
  const suggestion = suggestAmountToCollect({
    paymentMethod,
    saleBalance,
    destination: city
      ? { code: city.code, shippingType: resolveShippingType({ shippingType: city.shippingType, freeShipping: city.freeShipping }) }
      : null,
  });
  return { ...suggestion, paymentMethod };
}

// --- Crear guia ---

export type CreateShipmentInput = {
  dispatchId: string;
  createdById: string;
  destinationCityId?: string | null;
  amountToCollect?: number | null; // null/undefined = saldo de la venta
  estimatedDelivery?: Date | null; // null/undefined = automatica
};

export async function createShipmentForDispatch(input: CreateShipmentInput): Promise<{ id: string; code: string }> {
  const dispatch = await prisma.dispatch.findUnique({
    where: { id: input.dispatchId },
    select: {
      id: true,
      status: true,
      deliveryType: true,
      shipment: { select: { id: true } },
      order: {
        select: {
          saleId: true,
          client: { select: { phone: true, city: true, department: true } },
        },
      },
    },
  });
  if (!dispatch) {
    throw new ShipmentError("Despacho no encontrado.");
  }
  if (dispatch.shipment) {
    throw new ShipmentError("Este despacho ya tiene guía Magilus.");
  }
  if (dispatch.status === "CANCELLED" || dispatch.status === "RETURNED") {
    throw new ShipmentError("El despacho está cancelado o devuelto.");
  }

  const destination = input.destinationCityId
    ? await findCityOption(input.destinationCityId)
    : await resolveCityFromClient(dispatch.order.client?.city, dispatch.order.client?.department);
  if (input.destinationCityId && !destination) {
    throw new ShipmentError("Ciudad destino no encontrada.");
  }

  const [originCityId, suggestedAmount] = await Promise.all([
    getBogotaCityId(),
    input.amountToCollect == null
      ? computeCollectSuggestion(dispatch.order.saleId, destination?.id).then((suggestion) => suggestion.amount)
      : Promise.resolve(0),
  ]);
  const amountToCollect = Math.max(0, Math.round(input.amountToCollect ?? suggestedAmount));
  const last4 = phoneLast4(dispatch.order.client?.phone);
  const now = new Date();
  const estimatedDelivery = input.estimatedDelivery ?? estimateDelivery(now, destination?.code ?? null);

  // Codigo aleatorio y unico: se verifica que no exista ya en Shipment.code (reintenta si choca).
  const code = await generateUniqueShipmentCode((candidate) =>
    prisma.shipment.findUnique({ where: { code: candidate }, select: { id: true } }).then((found) => found !== null),
  );
  try {
    return await prisma.$transaction(async (tx) => {
      const shipment = await tx.shipment.create({
        data: {
          code,
          dispatchId: dispatch.id,
          destinationCityId: destination?.id ?? null,
          originCityId,
          currentCityId: originCityId,
          estimatedDelivery,
          etaIsManual: Boolean(input.estimatedDelivery),
          collectOnDelivery: amountToCollect > 0,
          amountToCollect,
          phoneLast4: last4,
          publicEnabled: Boolean(last4),
          carrierToken: generateCarrierToken(),
          createdById: input.createdById,
        },
        select: { id: true, code: true },
      });
      await tx.shipmentEvent.create({
        data: {
          shipmentId: shipment.id,
          kind: "STATUS",
          status: "CREATED",
          cityId: originCityId,
          visibleToClient: true,
          actor: "MAGILUS",
          actorUserId: input.createdById,
          occurredAt: now,
        },
      });
      return shipment;
    });
  } catch (error) {
    // Carrera rarisima: otro proceso tomo el mismo codigo entre la verificacion y el insert.
    const isCodeCollision =
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002" &&
      JSON.stringify(error.meta ?? {}).includes("code");
    if (isCodeCollision) {
      throw new ShipmentError("No se pudo asignar el código de la guía. Intenta de nuevo.");
    }
    throw error;
  }
}

// --- Eventos (etapas y novedades) ---

export const MAX_CARRIER_EVENTS_PER_DAY = 30;

export type AddShipmentEventInput = {
  shipmentId: string;
  actor: "MAGILUS" | "CARRIER";
  actorUserId?: string | null;
  actorLabel?: string | null;
  ipHash?: string | null;
  kind: "STATUS" | "INCIDENT" | "NOTE";
  status?: ShipmentStatus | null;
  incident?: ShipmentIncident | null;
  note?: string | null;
  cityId?: string | null;
  photoUrl?: string | null;
  visibleToClient: boolean;
  receivedByName?: string | null;
};

// Guarda el evento, mueve la etapa/ciudad de la guia y sincroniza el despacho, todo en una
// transaccion (un solo lugar para no tener dos verdades).
export async function addShipmentEvent(input: AddShipmentEventInput): Promise<{ status: ShipmentStatus }> {
  const note = input.note?.trim().slice(0, 280) || null;
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const shipment = await tx.shipment.findUnique({
      where: { id: input.shipmentId },
      select: {
        id: true,
        status: true,
        createdById: true,
        deliveryPhotoUrl: true,
        dispatch: {
          select: {
            id: true,
            status: true,
            orderId: true,
            deliveryPhotoUrl: true,
            order: { select: { status: true } },
          },
        },
      },
    });
    if (!shipment) {
      throw new ShipmentError("Guía no encontrada.");
    }

    if (input.actor === "CARRIER") {
      if (isFinalShipmentStatus(shipment.status)) {
        throw new ShipmentError("Esta guía ya está cerrada.");
      }
      const recent = await tx.shipmentEvent.count({
        where: { shipmentId: shipment.id, actor: "CARRIER", createdAt: { gte: new Date(now.getTime() - 86_400_000) } },
      });
      if (recent >= MAX_CARRIER_EVENTS_PER_DAY) {
        throw new ShipmentError("Se alcanzó el máximo de reportes por hoy. Comunícate con Magilus.");
      }
    }

    if (input.cityId) {
      const city = await tx.transportCity.findUnique({ where: { id: input.cityId }, select: { id: true } });
      if (!city) {
        throw new ShipmentError("Ciudad no encontrada.");
      }
    }

    let nextStatus = shipment.status;
    if (input.kind === "STATUS") {
      if (!input.status) {
        throw new ShipmentError("Selecciona la etapa.");
      }
      const check =
        input.actor === "CARRIER"
          ? canCarrierMoveTo(shipment.status, input.status)
          : canMagilusMoveTo(shipment.status, input.status, note ?? "");
      if (!check.ok) {
        throw new ShipmentError(check.error);
      }
      nextStatus = input.status;
    } else if (input.kind === "INCIDENT" && !input.incident) {
      throw new ShipmentError("Selecciona la novedad.");
    } else if (input.kind === "NOTE" && !note) {
      throw new ShipmentError("Escribe la nota.");
    }

    const delivering = input.kind === "STATUS" && nextStatus === "DELIVERED";
    const receivedByName = input.receivedByName?.trim().slice(0, 120) || null;
    if (delivering && input.actor === "CARRIER" && (!input.photoUrl || !receivedByName)) {
      throw new ShipmentError("Para entregar sube la foto y escribe quién recibió.");
    }

    await tx.shipmentEvent.create({
      data: {
        shipmentId: shipment.id,
        kind: input.kind,
        status: input.kind === "STATUS" ? nextStatus : null,
        incident: input.kind === "INCIDENT" ? input.incident : null,
        note,
        cityId: input.cityId ?? null,
        photoUrl: input.photoUrl ?? null,
        visibleToClient: input.visibleToClient,
        actor: input.actor,
        actorUserId: input.actorUserId ?? null,
        actorLabel: input.actorLabel?.trim().slice(0, 120) || null,
        ipHash: input.ipHash ?? null,
        occurredAt: now,
      },
    });

    await tx.shipment.update({
      where: { id: shipment.id },
      data: {
        status: nextStatus,
        ...(input.cityId ? { currentCityId: input.cityId } : {}),
        ...(delivering
          ? {
              deliveredAt: now,
              receivedByName: receivedByName ?? undefined,
              deliveryPhotoUrl: input.photoUrl ?? shipment.deliveryPhotoUrl,
            }
          : {}),
        ...(input.kind === "STATUS" && shipment.status === "DELIVERED" && nextStatus !== "DELIVERED"
          ? { deliveredAt: null }
          : {}),
      },
    });

    if (input.kind === "STATUS") {
      await syncDispatchFromShipment(tx, {
        dispatch: shipment.dispatch,
        shipmentStatus: nextStatus,
        changedById: input.actorUserId ?? shipment.createdById,
        photoUrl: input.photoUrl ?? null,
        byCarrier: input.actor === "CARRIER",
      });
    }

    return { status: nextStatus };
  });
}

async function syncDispatchFromShipment(
  tx: Prisma.TransactionClient,
  params: {
    dispatch: {
      id: string;
      status: DispatchStatus;
      orderId: string;
      deliveryPhotoUrl: string | null;
      order: { status: string };
    };
    shipmentStatus: ShipmentStatus;
    changedById: string;
    photoUrl: string | null;
    byCarrier: boolean;
  },
): Promise<void> {
  const { dispatch } = params;
  const target = dispatchStatusForShipment(params.shipmentStatus, dispatch.status);
  if (!target) {
    return;
  }
  const now = new Date();

  if (target === "SHIPPED") {
    await tx.dispatch.update({ where: { id: dispatch.id }, data: { status: "SHIPPED", shippedAt: now } });
    return;
  }
  if (target === "RETURNED") {
    await tx.dispatch.update({ where: { id: dispatch.id }, data: { status: "RETURNED" } });
    return;
  }
  if (target === "DELIVERED") {
    await tx.dispatch.update({
      where: { id: dispatch.id },
      data: {
        status: "DELIVERED",
        deliveredAt: now,
        ...(params.photoUrl && !dispatch.deliveryPhotoUrl
          ? { deliveryPhotoUrl: params.photoUrl, deliveryPhotoName: "Foto de entrega (guía Magilus)" }
          : {}),
      },
    });
    // La orden se cierra solo si ya estaba toda despachada y no queda otro despacho abierto.
    const openDispatches = await tx.dispatch.count({
      where: {
        orderId: dispatch.orderId,
        id: { not: dispatch.id },
        status: { in: ["PENDING", "PACKING", "SHIPPED"] },
      },
    });
    if (openDispatches === 0 && dispatch.order.status === "DISPATCHED") {
      await tx.order.update({ where: { id: dispatch.orderId }, data: { status: "COMPLETED", completedAt: now } });
      await tx.orderStatusHistory.create({
        data: {
          orderId: dispatch.orderId,
          fromStatus: "DISPATCHED",
          toStatus: "COMPLETED",
          note: params.byCarrier
            ? "Pedido entregado (reportado por el transportador en la guía Magilus)"
            : "Pedido entregado (guía Magilus)",
          changedById: params.changedById,
        },
      });
    }
  }
}

// Cuando el despacho cambia por las pantallas de siempre (Despachos / Entregar), la guia lo
// refleja. Nunca lanza: si falla, el cambio del despacho ya quedo hecho.
export async function syncShipmentFromDispatch(
  dispatchId: string,
  dispatchStatus: DispatchStatus,
  userId: string,
): Promise<void> {
  try {
    const shipment = await prisma.shipment.findUnique({
      where: { dispatchId },
      select: { id: true, status: true },
    });
    if (!shipment) {
      return;
    }
    const target: ShipmentStatus | null =
      dispatchStatus === "DELIVERED"
        ? "DELIVERED"
        : dispatchStatus === "RETURNED"
          ? "RETURNED"
          : dispatchStatus === "CANCELLED"
            ? "CANCELLED"
            : dispatchStatus === "SHIPPED" && shipment.status === "CREATED"
              ? "PICKED_UP"
              : null;
    if (!target || target === shipment.status || isFinalShipmentStatus(shipment.status)) {
      return;
    }
    const now = new Date();
    await prisma.$transaction([
      prisma.shipmentEvent.create({
        data: {
          shipmentId: shipment.id,
          kind: "STATUS",
          status: target,
          visibleToClient: target !== "CANCELLED",
          actor: "SYSTEM",
          actorUserId: userId,
          note: `Actualizada desde el despacho (${SHIPMENT_STATUS_LABEL[target]})`,
          occurredAt: now,
        },
      }),
      prisma.shipment.update({
        where: { id: shipment.id },
        data: { status: target, ...(target === "DELIVERED" ? { deliveredAt: now } : {}) },
      }),
    ]);
  } catch (error) {
    console.error("[guias] No se pudo sincronizar la guía con el despacho:", error);
  }
}

// --- Fecha estimada y destino ---

export async function updateShipmentEta(params: {
  shipmentId: string;
  estimatedDelivery: Date;
  note: string | null;
  visibleToClient: boolean;
  actorUserId: string;
}): Promise<void> {
  await prisma.$transaction([
    prisma.shipment.update({
      where: { id: params.shipmentId },
      data: { estimatedDelivery: params.estimatedDelivery, etaIsManual: true },
    }),
    prisma.shipmentEvent.create({
      data: {
        shipmentId: params.shipmentId,
        kind: "ETA_CHANGE",
        newEta: params.estimatedDelivery,
        note: params.note?.trim().slice(0, 280) || null,
        visibleToClient: params.visibleToClient,
        actor: "MAGILUS",
        actorUserId: params.actorUserId,
      },
    }),
  ]);
}

// Cambia el destino; si la fecha no se puso a mano, se recalcula desde la creacion.
export async function updateShipmentDestination(shipmentId: string, cityId: string): Promise<void> {
  const [shipment, city] = await Promise.all([
    prisma.shipment.findUnique({ where: { id: shipmentId }, select: { etaIsManual: true, createdAt: true } }),
    findCityOption(cityId),
  ]);
  if (!shipment) {
    throw new ShipmentError("Guía no encontrada.");
  }
  if (!city) {
    throw new ShipmentError("Ciudad no encontrada.");
  }
  await prisma.shipment.update({
    where: { id: shipmentId },
    data: {
      destinationCityId: city.id,
      ...(shipment.etaIsManual ? {} : { estimatedDelivery: estimateDelivery(shipment.createdAt, city.code) }),
    },
  });
}

// --- Enlace del transportador ---

const CARRIER_LINK_DAYS_AFTER_DELIVERY = 3;

export function isCarrierLinkUsable(shipment: {
  carrierTokenActive: boolean;
  status: ShipmentStatus;
  deliveredAt: Date | null;
}): boolean {
  if (!shipment.carrierTokenActive || shipment.status === "CANCELLED") {
    return false;
  }
  if (shipment.deliveredAt) {
    const limit = shipment.deliveredAt.getTime() + CARRIER_LINK_DAYS_AFTER_DELIVERY * 86_400_000;
    return Date.now() <= limit;
  }
  return true;
}

export async function findShipmentByCarrierToken(token: string) {
  if (!token || token.length < 20 || token.length > 64) {
    return null;
  }
  const shipment = await prisma.shipment.findUnique({
    where: { carrierToken: token },
    select: {
      id: true,
      code: true,
      status: true,
      deliveredAt: true,
      carrierTokenActive: true,
      collectOnDelivery: true,
      amountToCollect: true,
      receivedByName: true,
      destinationCity: { select: citySelect },
      currentCity: { select: citySelect },
      dispatch: {
        select: {
          shippingAddress: true,
          order: {
            select: {
              client: { select: { name: true, phone: true, address: true, neighborhood: true, city: true } },
            },
          },
        },
      },
      events: {
        orderBy: { occurredAt: "desc" },
        take: 8,
        select: {
          id: true,
          kind: true,
          status: true,
          incident: true,
          occurredAt: true,
          city: { select: { name: true } },
        },
      },
    },
  });
  if (!shipment || !isCarrierLinkUsable(shipment)) {
    return null;
  }
  return shipment;
}
