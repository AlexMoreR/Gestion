import { describe, expect, it } from "vitest";
import { comboSavingsFromProduct, computeComboSavings } from "./storefront-offer";

describe("computeComboSavings", () => {
  it("resta el precio del combo a la suma de los componentes (con cantidades)", () => {
    expect(
      computeComboSavings(1_200_000, [
        { quantity: 1, price: 900_000 },
        { quantity: 2, price: 200_000 },
      ]),
    ).toBe(100_000);
  });

  it("acepta precios como texto (Decimal de Prisma)", () => {
    expect(computeComboSavings("500000.00", [{ quantity: 1, price: "600000.00" }])).toBe(100_000);
  });

  it("no muestra nada si el ahorro es cero o negativo", () => {
    expect(computeComboSavings(1_000_000, [{ quantity: 1, price: 1_000_000 }])).toBeNull();
    expect(computeComboSavings(1_000_000, [{ quantity: 1, price: 800_000 }])).toBeNull();
  });

  it("no muestra nada si falta algun componente o su precio", () => {
    expect(computeComboSavings(1_000_000, [])).toBeNull();
    expect(computeComboSavings(1_000_000, null)).toBeNull();
    expect(computeComboSavings(1_000_000, [{ quantity: 1, price: 0 }, { quantity: 1, price: 2_000_000 }])).toBeNull();
    expect(computeComboSavings(1_000_000, [{ quantity: 0, price: 2_000_000 }])).toBeNull();
    expect(computeComboSavings(1_000_000, [{ quantity: 1, price: null }])).toBeNull();
    expect(computeComboSavings(0, [{ quantity: 1, price: 2_000_000 }])).toBeNull();
  });
});

describe("comboSavingsFromProduct", () => {
  it("solo calcula para productos combo (isBundle)", () => {
    const bundleComponents = [{ quantity: 1, child: { price: 700_000 } }];
    expect(comboSavingsFromProduct({ isBundle: false, price: 500_000, bundleComponents })).toBeNull();
    expect(comboSavingsFromProduct({ isBundle: true, price: 500_000, bundleComponents })).toBe(200_000);
    expect(comboSavingsFromProduct({ isBundle: true, price: 500_000 })).toBeNull();
  });

  it("usa el precio vigente (oferta) del combo y de los componentes", () => {
    const now = new Date("2026-10-08T15:00:00Z");
    const promo = {
      promoStartsAt: new Date("2026-10-01T05:00:00Z"),
      promoEndsAt: new Date("2026-10-16T04:59:59Z"),
    };
    expect(
      comboSavingsFromProduct(
        {
          isBundle: true,
          price: 500_000,
          promoPrice: 450_000,
          ...promo,
          bundleComponents: [{ quantity: 1, child: { price: 700_000, promoPrice: 650_000, ...promo } }],
        },
        now,
      ),
    ).toBe(200_000);
  });
});
