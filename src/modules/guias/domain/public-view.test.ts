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

describe("aviso de fecha y franja de estado actual", () => {
  const baseEvent = { status: null, incident: null, note: null, actor: "MAGILUS", newEta: null, city: null };
  const inTransit = {
    ...baseEvent,
    id: "st1",
    kind: "STATUS",
    status: "IN_TRANSIT",
    actor: "CARRIER",
    occurredAt: new Date("2026-10-07T15:00:00Z"),
  };
  const etaChange = (id: string, eta: string, at: string) => ({
    ...baseEvent,
    id,
    kind: "ETA_CHANGE",
    newEta: new Date(`${eta}T12:00:00Z`),
    occurredAt: new Date(at),
  });
  const weather = {
    ...baseEvent,
    id: "in1",
    kind: "INCIDENT",
    incident: "WEATHER",
    actor: "CARRIER",
    occurredAt: new Date("2026-10-08T14:00:00Z"),
  };
  // Creada el 6-oct hacia Cali: la fecha automatica cae despues del 10-oct.
  const make = (events: unknown[]) =>
    ({
      id: "ckshipment0000000000000002",
      code: "MG-PMMGNV3F",
      status: "IN_TRANSIT",
      phoneLast4: "4567",
      publicEnabled: true,
      estimatedDelivery: new Date("2026-10-10T12:00:00Z"),
      createdAt: new Date("2026-10-06T15:00:00Z"),
      collectOnDelivery: false,
      amountToCollect: 0,
      weightKg: null,
      deliveredAt: null,
      receivedByName: null,
      deliveryPhotoUrl: null,
      originCity: { name: "Bogotá" },
      currentCity: null,
      destinationCity: { name: "Cali", code: "76001" },
      dispatch: { order: { client: { name: "Ana Lopez" } } },
      events,
    }) as unknown as PublicShipmentRow;

  it("fecha adelantada a mano: sin aviso y la franja sigue en En ruta", () => {
    const view = toPublicView(make([etaChange("eta1", "2026-10-10", "2026-10-09T03:50:00Z"), inTransit]));
    expect(view.etaDelayReason).toBeNull();
    expect(view.currentEvent?.title).toBe("En ruta");
    expect(view.events[0].title).toContain("Fecha estimada actualizada:");
    expect(view.events[0].title).toContain("10 de octubre");
  });

  it("fecha atrasada por una novedad de lluvias: aviso con la novedad", () => {
    const view = toPublicView(make([etaChange("eta1", "2026-10-20", "2026-10-08T16:00:00Z"), weather, inTransit]));
    expect(view.etaDelayReason).toBe("Lluvias en la vía");
    expect(view.currentEvent?.title).toBe("Novedad: Lluvias");
  });

  it("fecha atrasada a mano sin novedad: sin aviso", () => {
    const view = toPublicView(make([etaChange("eta1", "2026-10-20", "2026-10-08T16:00:00Z"), inTransit]));
    expect(view.etaDelayReason).toBeNull();
  });

  it("una novedad anterior al cambio previo no explica el nuevo atraso", () => {
    const view = toPublicView(
      make([
        etaChange("eta2", "2026-10-22", "2026-10-09T16:00:00Z"),
        etaChange("eta1", "2026-10-20", "2026-10-08T16:00:00Z"),
        weather,
        inTransit,
      ]),
    );
    expect(view.etaDelayReason).toBeNull();
  });
});
