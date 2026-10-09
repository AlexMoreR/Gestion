import { describe, expect, it } from "vitest";
import { publicShipmentSelect, toPublicView, type PublicShipmentRow } from "./public-view";

// La vista publica (consulta con 4 digitos y enlace directo) nunca debe traer el telefono
// completo, la direccion, la transportadora ni la guia del proveedor.
describe("toPublicView", () => {
  const phone = "3001234567";
  const address = "Calle 10 # 20-30 Apto 401";
  const row = {
    id: "ckshipment0000000000000001",
    code: "MG-7K4Q2P8X",
    status: "IN_TRANSIT",
    phoneLast4: "4567",
    publicEnabled: true,
    estimatedDelivery: new Date("2026-10-15T00:00:00Z"),
    collectOnDelivery: true,
    amountToCollect: 150000,
    weightKg: 12.5,
    deliveredAt: null,
    receivedByName: null,
    deliveryPhotoUrl: null,
    originCity: { name: "Bogotá" },
    currentCity: { name: "Ibagué" },
    destinationCity: { name: "Cali" },
    dispatch: { order: { client: { name: "Ana Maria Lopez" } } },
    events: [
      {
        id: "ev1",
        kind: "NOTE",
        status: null,
        incident: null,
        note: `Llamar al ${phone}, ${address}`,
        actor: "CARRIER",
        newEta: null,
        occurredAt: new Date("2026-10-08T15:00:00Z"),
        city: { name: "Ibagué" },
      },
    ],
    // Campos que NO estan en el select publico: si llegaran, no deben salir.
    phone,
    shippingAddress: address,
    carrierName: "Transportadora X",
    trackingNumber: "PROV-998877",
  } as unknown as PublicShipmentRow;

  it("no expone telefono completo, direccion, transportadora ni guia del proveedor", () => {
    const serialized = JSON.stringify(toPublicView(row));
    expect(serialized).not.toContain(phone);
    expect(serialized).not.toContain(address);
    expect(serialized).not.toContain("Transportadora X");
    expect(serialized).not.toContain("PROV-998877");
    expect(serialized).not.toContain(row.id);
  });

  it("muestra el celular enmascarado y el nombre abreviado", () => {
    const view = toPublicView(row);
    expect(view.phoneMasked).toBe("*** *** 4567");
    expect(view.recipientName).toBe("Ana L.");
    expect(view.amountToCollect).toBe(150000);
  });

  it("el select publico no pide telefono, direccion ni datos de la transportadora", () => {
    const keys = JSON.stringify(publicShipmentSelect);
    expect(keys).not.toMatch(/phone"|address|carrierName|trackingNumber|email/i);
  });
});
