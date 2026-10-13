import { describe, expect, it } from "vitest";
import {
  buildShippingLegs,
  distributeAmount,
  extraLegShippingReference,
  legacyDispatchLeg,
  MAX_EXTRA_SHIPPING_LEGS,
  parseExtraShippingLegs,
  resolveDispatchLegs,
  sumShippingLegs,
} from "./dispatch-shipping-legs";

describe("parseExtraShippingLegs", () => {
  it("sin dato no hay tramos", () => {
    expect(parseExtraShippingLegs(null)).toEqual({ legs: [], error: null });
    expect(parseExtraShippingLegs("")).toEqual({ legs: [], error: null });
    expect(parseExtraShippingLegs("[]")).toEqual({ legs: [], error: null });
  });

  it("lee proveedor, valor (con puntos de miles), guia y nota", () => {
    const raw = JSON.stringify([
      { carrierSupplierId: "s-marcos", amount: "80.000", trackingNumber: " G-1 ", note: "Cali a cliente" },
    ]);
    expect(parseExtraShippingLegs(raw)).toEqual({
      legs: [{ carrierSupplierId: "s-marcos", amount: 80000, trackingNumber: "G-1", note: "Cali a cliente" }],
      error: null,
    });
  });

  it("ignora filas vacias", () => {
    const raw = JSON.stringify([
      { carrierSupplierId: "", amount: 0, trackingNumber: "", note: "" },
      { carrierSupplierId: "s-1", amount: 5000 },
    ]);
    expect(parseExtraShippingLegs(raw).legs).toHaveLength(1);
  });

  it("valor sin proveedor es error (no se registra un envio a medias)", () => {
    const raw = JSON.stringify([{ carrierSupplierId: "", amount: 80000 }]);
    expect(parseExtraShippingLegs(raw).error).toMatch(/proveedor/);
  });

  it("valor invalido o JSON roto es error", () => {
    expect(parseExtraShippingLegs(JSON.stringify([{ carrierSupplierId: "s", amount: "abc" }])).error).toBeTruthy();
    expect(parseExtraShippingLegs("{no json").error).toBeTruthy();
    expect(parseExtraShippingLegs(JSON.stringify({ a: 1 })).error).toBeTruthy();
  });

  it("limita la cantidad de tramos", () => {
    const rows = Array.from({ length: MAX_EXTRA_SHIPPING_LEGS + 1 }, (_, i) => ({ carrierSupplierId: `s${i}`, amount: 1 }));
    expect(parseExtraShippingLegs(JSON.stringify(rows)).error).toBeTruthy();
  });
});

describe("valor total del envio", () => {
  it("Don Rafa 80.000 + Don Marcos 80.000 = 160.000", () => {
    const legs = buildShippingLegs(
      { carrierSupplierId: "s-rafa", carrierName: "P-04 Don Rafa", amount: 80000, trackingNumber: "R-1" },
      [{ carrierSupplierId: "s-marcos", carrierName: "Don Marcos", amount: 80000, trackingNumber: null, note: "Cali" }],
    );
    expect(legs.map((leg) => [leg.position, leg.carrierName, leg.amount])).toEqual([
      [0, "P-04 Don Rafa", 80000],
      [1, "Don Marcos", 80000],
    ]);
    expect(sumShippingLegs(legs)).toBe(160000);
  });

  it("un solo proveedor queda igual que antes", () => {
    const legs = buildShippingLegs(
      { carrierSupplierId: "s-rafa", carrierName: "Don Rafa", amount: 45000, trackingNumber: null },
      [],
    );
    expect(legs).toHaveLength(1);
    expect(sumShippingLegs(legs)).toBe(45000);
  });

  it("referencia del costo de un tramo adicional", () => {
    expect(extraLegShippingReference("DSP-000123", 1)).toBe("Despacho DSP-000123 - tramo 2");
  });
});

describe("distributeAmount", () => {
  it("reparte en proporcion a lo ya asignado y cuadra exacto", () => {
    const shares = distributeAmount(
      [
        { id: "a", quantity: 1, weight: 30000 },
        { id: "b", quantity: 1, weight: 50000 },
      ],
      80000,
    );
    expect(shares.get("a")).toBe(30000);
    expect(shares.get("b")).toBe(50000);
  });

  it("sin pesos reparte por cantidad; el residuo va al ultimo", () => {
    const shares = distributeAmount(
      [
        { id: "a", quantity: 1, weight: 0 },
        { id: "b", quantity: 1, weight: 0 },
        { id: "c", quantity: 1, weight: 0 },
      ],
      100000,
    );
    expect([shares.get("a"), shares.get("b"), shares.get("c")]).toEqual([33333, 33333, 33334]);
  });

  it("escala un reparto del total al valor de un solo proveedor", () => {
    // Reparto guardado del total (160.000); el cargo de un proveedor es 80.000.
    const shares = distributeAmount(
      [
        { id: "a", quantity: 1, weight: 120000 },
        { id: "b", quantity: 1, weight: 40000 },
      ],
      80000,
    );
    expect([shares.get("a"), shares.get("b")]).toEqual([60000, 20000]);
  });
});

describe("despachos viejos (migracion)", () => {
  it("cada despacho con transportadora pasa a ser su primer tramo, sin perder valor ni guia", () => {
    expect(
      legacyDispatchLeg({
        carrierSupplierId: "s-rafa",
        carrierName: "P-04 Don Rafa",
        shippingCost: 80000,
        trackingNumber: " 123 ",
      }),
    ).toEqual({
      position: 0,
      carrierSupplierId: "s-rafa",
      carrierName: "P-04 Don Rafa",
      amount: 80000,
      trackingNumber: "123",
      note: null,
    });
  });

  it("sin nombre guardado usa el del proveedor", () => {
    expect(
      legacyDispatchLeg({
        carrierSupplierId: "s-1",
        carrierName: null,
        carrierSupplierName: "Llano envios",
        shippingCost: 0,
        trackingNumber: null,
      })?.carrierName,
    ).toBe("Llano envios");
  });

  it("mostrador o recoge (sin transportadora ni valor) no tiene tramo", () => {
    expect(
      legacyDispatchLeg({ carrierSupplierId: null, carrierName: null, shippingCost: 0, trackingNumber: null }),
    ).toBeNull();
  });

  it("resolveDispatchLegs prefiere los tramos guardados y los ordena", () => {
    const dispatch = { carrierSupplierId: "s", carrierName: "X", shippingCost: 160000, trackingNumber: null };
    const stored = [
      { position: 1, carrierSupplierId: "m", carrierName: "Don Marcos", amount: 80000, trackingNumber: null, note: null },
      { position: 0, carrierSupplierId: "r", carrierName: "Don Rafa", amount: 80000, trackingNumber: null, note: null },
    ];
    expect(resolveDispatchLegs(stored, dispatch).map((leg) => leg.carrierName)).toEqual(["Don Rafa", "Don Marcos"]);
    expect(resolveDispatchLegs([], dispatch)).toHaveLength(1);
  });
});
