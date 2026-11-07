import { describe, expect, it } from "vitest";
import { buildOrderDeliveryInfo, shortColombiaDate, whatsAppDigits } from "./order-delivery-info";

const client = {
  name: "Maria",
  phone: "311 305 0001",
  address: "Cra 9#6-47",
  neighborhood: "Centro",
  city: "Popayán",
  department: "Cauca",
};

const dispatch = {
  code: "DSP-00102",
  status: "SHIPPED",
  deliveryType: "SHIPPING",
  carrierName: "Veloenvios",
  trackingNumber: "G-1",
  shippingAddress: "Cra 9#6-47",
};

const build = (
  contact: Parameters<typeof buildOrderDeliveryInfo>[0],
  dispatches: Parameters<typeof buildOrderDeliveryInfo>[1],
) => buildOrderDeliveryInfo(contact, dispatches, { orderCode: "ORD-00101", saleCode: "SAL-00092" });

describe("whatsAppDigits", () => {
  it("agrega el 57 solo a un celular colombiano de 10 dígitos", () => {
    expect(whatsAppDigits("311 305 0001")).toBe("573113050001");
    expect(whatsAppDigits("+57 311 305 0001")).toBe("573113050001");
    expect(whatsAppDigits("6024445566")).toBe("6024445566");
    expect(whatsAppDigits(null)).toBe("");
  });
});

describe("shortColombiaDate", () => {
  it("usa el día de Colombia, no el UTC", () => {
    expect(shortColombiaDate(new Date("2026-11-05T02:00:00Z"))).toBe("4-nov-2026");
  });
});

describe("buildOrderDeliveryInfo", () => {
  it("sin despacho usa la ficha del cliente", () => {
    const info = build(client, []);
    expect(info.dispatchCode).toBeNull();
    expect(info.address).toBe("Cra 9#6-47, Centro");
    expect(info.city).toBe("Popayán, Cauca");
    expect(info.carrier).toBeNull();
    expect(info.copyText).toBe(
      "Referencia: ORD-101 / SAL-92\nMaria\n311 305 0001\nCra 9#6-47, Centro\nPopayán, Cauca",
    );
  });

  it("sin venta la referencia lleva solo la orden", () => {
    const info = buildOrderDeliveryInfo(client, [], { orderCode: "ORD-00101", saleCode: null });
    expect(info.copyText.split("\n")[0]).toBe("Referencia: ORD-101");
  });

  it("toma el despacho más nuevo que siga activo", () => {
    const info = build(client, [
      { ...dispatch, code: "DSP-3", status: "CANCELLED" },
      { ...dispatch, code: "DSP-2", status: "RETURNED" },
      { ...dispatch, code: "DSP-1" },
    ]);
    expect(info.dispatchCode).toBe("DSP-1");
  });

  it("un despacho a otra dirección muestra también la de la ficha", () => {
    const info = build(client, [{ ...dispatch, shippingAddress: "Calle 1 # 2-3" }]);
    expect(info.address).toBe("Calle 1 # 2-3");
    expect(info.currentClientAddress).toBe("Cra 9#6-47, Centro");
  });

  it("la misma dirección en otras mayúsculas no cuenta como distinta", () => {
    const info = build(client, [{ ...dispatch, shippingAddress: "CRA 9#6-47" }]);
    expect(info.currentClientAddress).toBeNull();
  });

  it("prefiere la ciudad de la guía y usa su código si no hay guía de transportadora", () => {
    const info = build(client, [
      {
        ...dispatch,
        trackingNumber: null,
        shipment: { code: "MG-7K4Q", destinationCity: { name: "Cali", department: { name: "Valle del Cauca" } } },
      },
    ]);
    expect(info.city).toBe("Cali, Valle del Cauca");
    expect(info.tracking).toBe("MG-7K4Q");
  });

  it("usa el nombre del proveedor si el despacho no trae transportadora escrita", () => {
    const info = build(client, [
      { ...dispatch, carrierName: null, carrierSupplier: { name: "p-30 Veloenvios" } },
    ]);
    expect(info.carrier).toBe("p-30 Veloenvios");
  });

  it("recoge en bodega no toma la dirección como destino ni deja copiar", () => {
    const info = build(client, [{ ...dispatch, deliveryType: "PICKUP" }]);
    expect(info.pickup).toBe(true);
    expect(info.address).toBeNull();
    expect(info.copyText).toBe("");
  });

  it("sin datos no inventa nada", () => {
    const info = build({ name: "Maria" }, []);
    expect(info.address).toBeNull();
    expect(info.city).toBeNull();
    expect(info.copyText).toBe("");
    expect(build(null, []).address).toBeNull();
  });
});
