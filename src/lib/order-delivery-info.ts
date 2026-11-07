import { recipientAddress, recipientCity } from "../modules/guias/domain/document-view";
import { colombiaDayKey } from "./colombia-time";

// Datos de la franja "Cliente y entrega" de la ficha de la orden. Puro para poder probarlo.

type ClientContact = {
  name?: string | null;
  phone?: string | null;
  address?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  department?: string | null;
};

type DispatchForDelivery = {
  code: string;
  status: string;
  deliveryType: string;
  carrierName: string | null;
  carrierSupplier?: { name: string } | null;
  trackingNumber: string | null;
  shippingAddress: string | null;
  shipment?: {
    code: string;
    destinationCity?: { name: string; department?: { name: string } | null } | null;
  } | null;
};

export type OrderDeliveryInfo = {
  // null = aún sin despacho activo: dirección y ciudad salen de la ficha del cliente.
  dispatchCode: string | null;
  pickup: boolean;
  address: string | null;
  city: string | null;
  // Dirección de la ficha, solo si es distinta a la del despacho.
  currentClientAddress: string | null;
  carrier: string | null;
  tracking: string | null;
  // Vacío si no hay dirección ni ciudad que copiar.
  copyText: string;
};

// Solo dígitos, listo para wa.me; un celular colombiano de 10 dígitos lleva el 57. Puede quedar vacío.
export function whatsAppDigits(phone: string | null | undefined): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length === 10 && digits.startsWith("3") ? `57${digits}` : digits;
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// "4-nov-2026", en hora de Colombia.
export function shortColombiaDate(date: Date): string {
  const [year, month, day] = colombiaDayKey(date).split("-");
  return `${Number(day)}-${MESES[Number(month) - 1]}-${year}`;
}

// `dispatches` viene del más nuevo al más viejo: manda el último que no esté cancelado ni devuelto.
export function buildOrderDeliveryInfo(
  client: ClientContact | null | undefined,
  dispatches: DispatchForDelivery[],
): OrderDeliveryInfo {
  const dispatch = dispatches.find((item) => item.status !== "CANCELLED" && item.status !== "RETURNED") ?? null;

  // El formulario manda la dirección del cliente también al recoger en bodega: ahí no es un destino.
  if (dispatch && dispatch.deliveryType !== "SHIPPING") {
    return {
      dispatchCode: dispatch.code,
      pickup: true,
      address: null,
      city: null,
      currentClientAddress: null,
      carrier: null,
      tracking: null,
      copyText: "",
    };
  }

  const clientAddress = recipientAddress(null, client);
  const address = recipientAddress(dispatch?.shippingAddress, client);
  const city = recipientCity(dispatch?.shipment?.destinationCity, client);
  const differs =
    clientAddress !== null &&
    address !== null &&
    address.localeCompare(clientAddress, "es", { sensitivity: "base" }) !== 0;

  return {
    dispatchCode: dispatch?.code ?? null,
    pickup: false,
    address,
    city,
    currentClientAddress: differs ? clientAddress : null,
    carrier: dispatch ? dispatch.carrierName || dispatch.carrierSupplier?.name || null : null,
    tracking: dispatch ? dispatch.trackingNumber || dispatch.shipment?.code || null : null,
    copyText:
      address || city ? [client?.name, client?.phone, address, city].filter((line) => line?.trim()).join("\n") : "",
  };
}
