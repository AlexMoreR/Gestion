import { describe, expect, it } from "vitest";

import {
  CONTRAENTREGA_FEE_BOGOTA,
  CONTRAENTREGA_FEE_MAIN_CITY,
  contraentregaComboWarning,
  contraentregaShippingFee,
  isCamillaComboProduct,
  parsePaymentMethodInput,
  suggestAmountToCollect,
  toComboCheckProduct,
} from "./payment-method";

describe("parsePaymentMethodInput", () => {
  it("vacio o ausente es sin definir", () => {
    expect(parsePaymentMethodInput(null)).toBeNull();
    expect(parsePaymentMethodInput("")).toBeNull();
    expect(parsePaymentMethodInput("  ")).toBeNull();
  });
  it("acepta los dos valores y rechaza el resto", () => {
    expect(parsePaymentMethodInput("ANTICIPO_50_50")).toBe("ANTICIPO_50_50");
    expect(parsePaymentMethodInput("CONTRAENTREGA")).toBe("CONTRAENTREGA");
    expect(parsePaymentMethodInput("contraentrega")).toBeUndefined();
    expect(parsePaymentMethodInput("EFECTIVO")).toBeUndefined();
  });
});

describe("contraentregaShippingFee", () => {
  it("Bogota cobra $100.000", () => {
    expect(contraentregaShippingFee({ code: "11001", shippingType: "GRATIS" })).toBe(CONTRAENTREGA_FEE_BOGOTA);
    expect(CONTRAENTREGA_FEE_BOGOTA).toBe(100_000);
  });
  it("Cali, Medellin y ciudades GRATIS cobran $150.000", () => {
    expect(contraentregaShippingFee({ code: "76001", shippingType: null })).toBe(CONTRAENTREGA_FEE_MAIN_CITY);
    expect(contraentregaShippingFee({ code: "05001", shippingType: "COTIZAR" })).toBe(150_000);
    expect(contraentregaShippingFee({ code: "08001", shippingType: "GRATIS" })).toBe(150_000);
  });
  it("otras ciudades se cotizan (null)", () => {
    expect(contraentregaShippingFee({ code: "52835", shippingType: "COTIZAR" })).toBeNull();
    expect(contraentregaShippingFee({ code: "52835", shippingType: "ADICIONAL" })).toBeNull();
    expect(contraentregaShippingFee({ code: "52835", shippingType: "NO_LLEGA" })).toBeNull();
    expect(contraentregaShippingFee({ code: null, shippingType: "GRATIS" })).toBeNull();
    expect(contraentregaShippingFee(null)).toBeNull();
  });
});

describe("suggestAmountToCollect", () => {
  it("contraentrega suma saldo + envio", () => {
    expect(
      suggestAmountToCollect({
        paymentMethod: "CONTRAENTREGA",
        saleBalance: 989_000,
        destination: { code: "11001", shippingType: "GRATIS" },
      }),
    ).toEqual({ amount: 1_089_000, saleBalance: 989_000, shippingFee: 100_000, shippingPending: false });
  });
  it("contraentrega en ciudad sin envio gratis deja el envio pendiente", () => {
    const result = suggestAmountToCollect({
      paymentMethod: "CONTRAENTREGA",
      saleBalance: 500_000,
      destination: { code: "52835", shippingType: "COTIZAR" },
    });
    expect(result.amount).toBe(500_000);
    expect(result.shippingPending).toBe(true);
    expect(result.shippingFee).toBeNull();
  });
  it("50/50 y sin definir sugieren solo el saldo", () => {
    const destination = { code: "11001", shippingType: "GRATIS" as const };
    expect(suggestAmountToCollect({ paymentMethod: "ANTICIPO_50_50", saleBalance: 0, destination }).amount).toBe(0);
    expect(suggestAmountToCollect({ paymentMethod: "ANTICIPO_50_50", saleBalance: 200_000, destination }).amount).toBe(
      200_000,
    );
    expect(suggestAmountToCollect({ paymentMethod: null, saleBalance: 50_000.4, destination }).amount).toBe(50_000);
  });
});

describe("combo de camilla", () => {
  it("se reconoce por categoria o por codigo CMB", () => {
    expect(isCamillaComboProduct({ code: "X1", categoryName: "COMBO DE CAMILLAS" })).toBe(true);
    expect(isCamillaComboProduct({ code: "CMB05", categoryName: null })).toBe(true);
    expect(isCamillaComboProduct({ code: "MYS01", categoryName: "COMBO MESAS Y SILLAS" })).toBe(false);
    expect(isCamillaComboProduct({ code: "BMV20", categoryName: "BUTACOS MANI Y PEDY" })).toBe(false);
  });
  it("un componente de un combo de camilla cuenta", () => {
    const product = toComboCheckProduct({
      code: "CAM-1",
      category: { name: "CAMILLAS" },
      partOfBundles: [{ parent: { code: "CMB18", category: { name: "COMBO DE CAMILLAS" } } }],
    });
    expect(isCamillaComboProduct(product)).toBe(true);
  });
  it("aviso solo si es contraentrega sin combo", () => {
    expect(contraentregaComboWarning("CONTRAENTREGA", [{ code: "MYS01", categoryName: "COMBO MESAS Y SILLAS" }])).toMatch(
      /combo de camilla/,
    );
    expect(contraentregaComboWarning("CONTRAENTREGA", [{ code: "CMB02", categoryName: "COMBO DE CAMILLAS" }])).toBeNull();
    expect(contraentregaComboWarning("ANTICIPO_50_50", [])).toBeNull();
    expect(contraentregaComboWarning(null, [])).toBeNull();
  });
});
