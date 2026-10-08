import { describe, expect, it } from "vitest";
import {
  endOfBogotaDay,
  formatBogotaDate,
  getActivePromo,
  getCurrentStorePrice,
  parseProductPromoInput,
  promoInfoText,
  startOfBogotaDay,
  toBogotaDateOnly,
} from "./product-promo";

const base = {
  price: 1_549_000,
  regularPrice: 1_800_000,
  promoPrice: 1_449_000,
  promoStartsAt: startOfBogotaDay("2026-10-01"),
  promoEndsAt: endOfBogotaDay("2026-10-15"),
};

describe("getActivePromo (oferta vigente)", () => {
  it("vigente entre desde y hasta: OFF = precio normal - oferta", () => {
    const promo = getActivePromo(base, new Date("2026-10-08T15:00:00Z"));
    expect(promo).not.toBeNull();
    expect(promo?.promoPrice).toBe(1_449_000);
    expect(promo?.normalPrice).toBe(1_800_000);
    expect(promo?.off).toBe(351_000);
  });

  it("incluye el primer y el ultimo dia completos (hora Colombia)", () => {
    expect(getActivePromo(base, new Date("2026-10-01T05:00:00Z"))).not.toBeNull(); // 00:00 COT
    expect(getActivePromo(base, new Date("2026-10-01T04:59:59Z"))).toBeNull(); // 23:59 del dia anterior
    expect(getActivePromo(base, new Date("2026-10-16T04:59:59Z"))).not.toBeNull(); // 23:59:59 del 15
    expect(getActivePromo(base, new Date("2026-10-16T05:00:01Z"))).toBeNull();
  });

  it("sin precio normal cargado usa el precio detal como normal", () => {
    const promo = getActivePromo({ ...base, regularPrice: null }, new Date("2026-10-08T15:00:00Z"));
    expect(promo?.normalPrice).toBe(1_549_000);
    expect(promo?.off).toBe(100_000);
  });

  it("no hay oferta si la oferta no es menor al precio normal", () => {
    expect(getActivePromo({ ...base, promoPrice: 1_800_000 }, new Date("2026-10-08T15:00:00Z"))).toBeNull();
    expect(getActivePromo({ ...base, promoPrice: 2_000_000 }, new Date("2026-10-08T15:00:00Z"))).toBeNull();
  });

  it("no hay oferta si falta precio o alguna fecha", () => {
    const now = new Date("2026-10-08T15:00:00Z");
    expect(getActivePromo({ ...base, promoPrice: null }, now)).toBeNull();
    expect(getActivePromo({ ...base, promoStartsAt: null }, now)).toBeNull();
    expect(getActivePromo({ ...base, promoEndsAt: null }, now)).toBeNull();
  });

  it("acepta Decimal como texto y fechas ISO", () => {
    const promo = getActivePromo(
      {
        price: "1549000.00",
        regularPrice: "1800000.00",
        promoPrice: "1449000.00",
        promoStartsAt: "2026-10-01T05:00:00.000Z",
        promoEndsAt: "2026-10-16T04:59:59.999Z",
      },
      new Date("2026-10-08T15:00:00Z"),
    );
    expect(promo?.off).toBe(351_000);
  });
});

describe("getCurrentStorePrice", () => {
  it("oferta vigente: precio de oferta; si no: precio detal", () => {
    expect(getCurrentStorePrice(base, new Date("2026-10-08T15:00:00Z"))).toBe(1_449_000);
    expect(getCurrentStorePrice(base, new Date("2026-11-01T15:00:00Z"))).toBe(1_549_000);
  });
});

describe("fechas en hora de Colombia", () => {
  it("convierte ida y vuelta AAAA-MM-DD", () => {
    expect(toBogotaDateOnly(startOfBogotaDay("2026-10-01"))).toBe("2026-10-01");
    expect(toBogotaDateOnly(endOfBogotaDay("2026-10-15"))).toBe("2026-10-15");
    expect(toBogotaDateOnly(null)).toBeNull();
  });

  it("formatea para el cliente", () => {
    expect(formatBogotaDate(endOfBogotaDay("2026-10-15"))).toMatch(/15 oct 2026/);
  });

  it("arma el texto del ⓘ", () => {
    const promo = getActivePromo(base, new Date("2026-10-08T15:00:00Z"));
    expect(promo).not.toBeNull();
    if (promo) {
      expect(promoInfoText(promo, (value) => `$${value}`)).toBe(
        "Precio normal $1800000. Oferta válida del 1 oct 2026 al 15 oct 2026.",
      );
    }
  });
});

describe("parseProductPromoInput", () => {
  it("todo vacio = sin precio normal ni oferta", () => {
    expect(parseProductPromoInput({ regularPrice: "", promoPrice: "", promoStartsAt: "", promoEndsAt: "" })).toEqual({
      ok: true,
      value: { regularPrice: null, promoPrice: null, promoStartsAt: null, promoEndsAt: null },
    });
  });

  it("lee montos con puntos de miles y fechas", () => {
    const result = parseProductPromoInput({
      regularPrice: "1.800.000",
      promoPrice: "1449000",
      promoStartsAt: "2026-10-01",
      promoEndsAt: "2026-10-15",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.regularPrice).toBe(1_800_000);
      expect(result.value.promoPrice).toBe(1_449_000);
      expect(result.value.promoStartsAt?.toISOString()).toBe("2026-10-01T05:00:00.000Z");
      expect(result.value.promoEndsAt?.toISOString()).toBe("2026-10-16T04:59:59.999Z");
    }
  });

  it("rechaza oferta incompleta, fechas al reves y montos invalidos", () => {
    expect(parseProductPromoInput({ regularPrice: "", promoPrice: "100", promoStartsAt: "", promoEndsAt: "" }).ok).toBe(false);
    expect(
      parseProductPromoInput({ regularPrice: "", promoPrice: "100", promoStartsAt: "2026-10-15", promoEndsAt: "2026-10-01" }).ok,
    ).toBe(false);
    expect(parseProductPromoInput({ regularPrice: "abc", promoPrice: "", promoStartsAt: "", promoEndsAt: "" }).ok).toBe(false);
    expect(parseProductPromoInput({ regularPrice: "-5", promoPrice: "", promoStartsAt: "", promoEndsAt: "" }).ok).toBe(false);
  });
});
