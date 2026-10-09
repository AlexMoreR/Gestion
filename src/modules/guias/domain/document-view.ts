import type { Prisma } from "@prisma/client";
import { publicShipmentSelect, toPublicView, type PublicShipmentView } from "./public-view";

// Vista del DOCUMENTO formal de la guia (/guia/<codigo>.<firma>/documento). Es la vista publica
// (public-view.ts) mas la direccion de entrega del cliente. Solo la pide la pagina del documento:
// la pagina "Estado del envio" (/guia y /guia/[token]) sigue usando toPublicView, sin direccion,
// para que la direccion nunca viaje al navegador en esa pagina.
// Puro (sin Prisma en tiempo de ejecucion) para poder probarlo.

export type DocumentShipmentView = PublicShipmentView & {
  // Direccion de entrega de ESTA guia: "Calle 10 # 20-30, El Prado". null = por confirmar.
  recipientAddress: string | null;
  // Ciudad de entrega con departamento: "Cali, Valle del Cauca". null = por confirmar.
  recipientCity: string | null;
};

// Lo mismo que la vista publica + direccion del despacho y del cliente del pedido.
export const documentShipmentSelect = {
  ...publicShipmentSelect,
  destinationCity: { select: { name: true, code: true, department: { select: { name: true } } } },
  dispatch: {
    select: {
      shippingAddress: true,
      order: {
        select: {
          client: { select: { name: true, address: true, neighborhood: true, city: true, department: true } },
        },
      },
    },
  },
} satisfies Prisma.ShipmentSelect;

export type DocumentShipmentRow = Prisma.ShipmentGetPayload<{ select: typeof documentShipmentSelect }>;

function clean(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function sameText(a: string, b: string): boolean {
  return a.localeCompare(b, "es", { sensitivity: "base" }) === 0;
}

function containsText(haystack: string, needle: string): boolean {
  return haystack.toLocaleLowerCase("es").includes(needle.toLocaleLowerCase("es"));
}

// Direccion de entrega mas especifica para esta guia:
// 1) la del despacho (shippingAddress, la que se escribio al despachar; por defecto es la del cliente);
// 2) si no hay, la del cliente del pedido.
// El barrio del cliente solo se agrega si la direccion es la del cliente (si el despacho va a otra
// direccion, el barrio guardado del cliente podria ser de otro lugar).
export function recipientAddress(
  shippingAddress: string | null | undefined,
  client: { address?: string | null; neighborhood?: string | null } | null | undefined,
): string | null {
  const dispatchStreet = clean(shippingAddress);
  const clientStreet = clean(client?.address);
  const neighborhood = clean(client?.neighborhood);
  const street = dispatchStreet || clientStreet;
  if (!street) {
    return null;
  }
  const isClientAddress = !dispatchStreet || (clientStreet !== "" && sameText(dispatchStreet, clientStreet));
  if (isClientAddress && neighborhood && !containsText(street, neighborhood)) {
    return `${street}, ${neighborhood}`;
  }
  return street;
}

// Ciudad de entrega: la ciudad destino de la guia (con su departamento); si la guia no tiene, la
// del cliente del pedido.
export function recipientCity(
  destination: { name: string; department?: { name: string } | null } | null | undefined,
  client: { city?: string | null; department?: string | null } | null | undefined,
): string | null {
  const city = clean(destination?.name) || clean(client?.city);
  if (!city) {
    return null;
  }
  const department = destination?.name ? clean(destination.department?.name) : clean(client?.department);
  if (!department || containsText(department, city) || containsText(city, department)) {
    return city;
  }
  return `${city}, ${department}`;
}

export function toDocumentView(shipment: DocumentShipmentRow, documentToken: string | null = null): DocumentShipmentView {
  const client = shipment.dispatch?.order?.client;
  return {
    ...toPublicView(shipment, documentToken),
    recipientAddress: recipientAddress(shipment.dispatch?.shippingAddress, client),
    recipientCity: recipientCity(shipment.destinationCity, client),
  };
}
