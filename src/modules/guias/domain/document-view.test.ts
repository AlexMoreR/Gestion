import { describe, expect, it } from "vitest";
import { documentShipmentSelect, recipientAddress, recipientCity, toDocumentView, type DocumentShipmentRow } from "./document-view";
import { publicShipmentSelect, toPublicView } from "./public-view";

// La direccion de entrega solo sale en el documento de la guia (/guia/[token]/documento).
// La pagina "Estado del envio" (/guia y /guia/[token]) usa toPublicView y no la recibe.
describe("vista del documento de la guia", () => {
  const phone = "3001234567";
  const row = {
    id: "ckshipment0000000000000001",
    code: "MG-7K4Q2P8X",
    status: "IN_TRANSIT",
    phoneLast4: "4567",
    publicEnabled: true,
    estimatedDelivery: new Date("2026-10-15T00:00:00Z"),
    createdAt: new Date("2026-10-06T15:00:00Z"),
    collectOnDelivery: false,
    amountToCollect: 0,
    weightKg: null,
    deliveredAt: null,
    receivedByName: null,
    deliveryPhotoUrl: null,
    originCity: { name: "Bogotá" },
    currentCity: null,
    destinationCity: { name: "Cali", code: "76001", department: { name: "Valle del Cauca" } },
    dispatch: {
      shippingAddress: "Calle 10 # 20-30 Apto 401",
      order: {
        client: {
          name: "Ana Maria Lopez",
          address: "Calle 10 # 20-30 Apto 401",
          neighborhood: "El Prado",
          city: "Cali",
          department: "Valle del Cauca",
          phone,
        },
      },
    },
    events: [],
  } as unknown as DocumentShipmentRow;

  it("la vista de estado NO incluye la direccion ni el barrio", () => {
    const serialized = JSON.stringify(toPublicView(row));
    expect(serialized).not.toContain("Calle 10");
    expect(serialized).not.toContain("El Prado");
    expect(serialized).not.toContain(phone);
    expect(Object.keys(toPublicView(row))).not.toContain("recipientAddress");
    expect(JSON.stringify(publicShipmentSelect)).not.toMatch(/address|neighborhood/i);
  });

  it("la vista del documento SI incluye la direccion completa con barrio", () => {
    const view = toDocumentView(row, "MG-7K4Q2P8X.abcdefghijABCDEFGHIJ_-");
    expect(view.recipientAddress).toBe("Calle 10 # 20-30 Apto 401, El Prado");
    expect(view.recipientCity).toBe("Cali, Valle del Cauca");
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain(phone);
    expect(serialized).not.toContain(row.id);
    expect(JSON.stringify(documentShipmentSelect)).not.toMatch(/phone"|carrierName|trackingNumber|email/i);
  });

  it("usa la direccion del despacho; el barrio del cliente solo si es la misma direccion", () => {
    const client = { address: "Cra 1 # 2-3", neighborhood: "San Fernando" };
    expect(recipientAddress("Av. 6N # 23-50 Local 2", client)).toBe("Av. 6N # 23-50 Local 2");
    expect(recipientAddress("cra 1 # 2-3", client)).toBe("cra 1 # 2-3, San Fernando");
    expect(recipientAddress("", client)).toBe("Cra 1 # 2-3, San Fernando");
    expect(recipientAddress(null, { address: "Cra 1 # 2-3, San Fernando", neighborhood: "San Fernando" })).toBe(
      "Cra 1 # 2-3, San Fernando",
    );
  });

  it("sin direccion registrada queda null (el documento muestra 'Por confirmar')", () => {
    expect(recipientAddress(null, null)).toBeNull();
    expect(recipientAddress("  ", { address: "", neighborhood: "El Prado" })).toBeNull();
    const view = toDocumentView({
      ...row,
      dispatch: { shippingAddress: null, order: { client: null } },
    } as unknown as DocumentShipmentRow);
    expect(view.recipientAddress).toBeNull();
  });

  it("ciudad de entrega: la de la guia con departamento; si no hay, la del cliente", () => {
    expect(recipientCity({ name: "Bogotá", department: { name: "Bogotá D.C." } }, null)).toBe("Bogotá");
    expect(recipientCity(null, { city: "Pasto", department: "Nariño" })).toBe("Pasto, Nariño");
    expect(recipientCity(null, null)).toBeNull();
  });
});
