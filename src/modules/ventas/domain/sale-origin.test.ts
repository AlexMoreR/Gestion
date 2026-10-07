import { describe, expect, it } from "vitest";

import {
  adKeyFromDetail,
  backfillFallbackOrigin,
  buildOriginDetail,
  effectiveOrigin,
  isProbableDirectSale,
  maskPhone,
  originDetailSummary,
  parseCrmLookup,
  parseOriginFilter,
  parseOriginNotice,
  phoneMatchKey,
  quoteCodeCandidates,
  resolveCrmOrigin,
  saleOriginLabel,
} from "./sale-origin";

describe("resolveCrmOrigin (regla REFERIDO_RECURRENTE)", () => {
  it("linea Admin con venta previa es RECURRENTE; sin venta previa es REFERIDO", () => {
    expect(resolveCrmOrigin("REFERIDO_RECURRENTE", true)).toBe("RECURRENTE");
    expect(resolveCrmOrigin("REFERIDO_RECURRENTE", false)).toBe("REFERIDO");
  });
  it("los demas origenes pasan tal cual, haya o no ventas previas", () => {
    expect(resolveCrmOrigin("META_ADS", true)).toBe("META_ADS");
    expect(resolveCrmOrigin("MARKETPLACE", false)).toBe("MARKETPLACE");
    expect(resolveCrmOrigin("REFERIDO", true)).toBe("REFERIDO");
    expect(resolveCrmOrigin("SIN_DATO", true)).toBe("SIN_DATO");
  });
});

describe("quoteCodeCandidates", () => {
  it("normaliza mayusculas, espacios y ceros", () => {
    expect(quoteCodeCandidates("COT-00121")).toEqual(["COT-00121", "COT-121"]);
    expect(quoteCodeCandidates(" cot-121 ")).toEqual(["COT-00121", "COT-121"]);
    expect(quoteCodeCandidates("cot 121")).toEqual(["COT-00121", "COT-121"]);
    expect(quoteCodeCandidates("COT00121")).toEqual(["COT-00121", "COT-121"]);
  });
  it("con 5 o mas digitos el canonico es el mismo codigo", () => {
    expect(quoteCodeCandidates("COT-12345")).toEqual(["COT-12345"]);
    expect(quoteCodeCandidates("COT-123456")).toEqual(["COT-123456"]);
  });
  it("otro formato se busca tal cual; vacio no busca nada", () => {
    expect(quoteCodeCandidates("abc-1")).toEqual(["ABC-1"]);
    expect(quoteCodeCandidates("   ")).toEqual([]);
    expect(quoteCodeCandidates(121)).toEqual([]);
  });
});

describe("parseOriginNotice (body del POST del CRM)", () => {
  it("acepta el contrato completo y agrega la linea al detalle", () => {
    const parsed = parseOriginNotice({
      quoteCode: "cot-121",
      origin: "META_ADS",
      originDetail: { adId: 120211, adTitle: " Combo negro ", sourceApp: "instagram", via: "cotizacion" },
      linea: "Ventas 1",
      contactPhone: "+57 300 123 4567",
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.notice.quoteCodes).toEqual(["COT-00121", "COT-121"]);
    expect(parsed.notice.origin).toBe("META_ADS");
    expect(parsed.notice.originDetail).toEqual({
      adId: "120211",
      adTitle: "Combo negro",
      sourceApp: "instagram",
      via: "cotizacion",
      linea: "Ventas 1",
    });
    expect(parsed.notice.contactPhone).toBe("+57 300 123 4567");
  });

  it("descarta llaves desconocidas del detalle (nunca guarda un telefono)", () => {
    const parsed = parseOriginNotice({
      quoteCode: "COT-00001",
      origin: "MARKETPLACE",
      originDetail: { mkCuenta: "MK-AB123", telefono: "3001234567" },
      linea: null,
      contactPhone: null,
    });
    expect(parsed.ok && parsed.notice.originDetail).toEqual({ mkCuenta: "MK-AB123" });
  });

  it("detalle y linea opcionales: sin nada queda null", () => {
    const parsed = parseOriginNotice({ quoteCode: "COT-00002", origin: "REFERIDO_RECURRENTE", originDetail: null, linea: null, contactPhone: null });
    expect(parsed.ok && parsed.notice.originDetail).toBeNull();
    expect(parsed.ok && parsed.notice.contactPhone).toBeNull();
  });

  it("rechaza origen desconocido, codigo vacio, via invalida o body que no es objeto", () => {
    expect(parseOriginNotice({ quoteCode: "COT-1", origin: "TIKTOK" }).ok).toBe(false);
    expect(parseOriginNotice({ quoteCode: "  ", origin: "META_ADS" }).ok).toBe(false);
    expect(parseOriginNotice({ origin: "META_ADS" }).ok).toBe(false);
    expect(parseOriginNotice({ quoteCode: "COT-1", origin: "META_ADS", originDetail: { via: "whatsapp" } }).ok).toBe(false);
    expect(parseOriginNotice(null).ok).toBe(false);
    expect(parseOriginNotice("COT-1").ok).toBe(false);
  });
});

describe("buildOriginDetail", () => {
  it("quita vacios y agrega linea", () => {
    expect(buildOriginDetail({ adTitle: "  ", adId: "9" }, " Admin ")).toEqual({ adId: "9", linea: "Admin" });
    expect(buildOriginDetail(null, null)).toBeNull();
    expect(buildOriginDetail({ adTitle: null }, "")).toBeNull();
  });
});

describe("telefonos", () => {
  it("clave de cruce: ultimos 10 digitos, con o sin 57", () => {
    expect(phoneMatchKey("+57 300 123 4567")).toBe("3001234567");
    expect(phoneMatchKey("300-123-4567")).toBe("3001234567");
    expect(phoneMatchKey("573001234567")).toBe("3001234567");
    expect(phoneMatchKey("12345")).toBeNull();
    expect(phoneMatchKey(null)).toBeNull();
  });
  it("enmascara dejando solo los ultimos 4", () => {
    expect(maskPhone("+57 300 123 4567")).toBe("***4567");
    expect(maskPhone("")).toBe("(sin telefono)");
  });
});

describe("etiquetas y filtro", () => {
  it("null o desconocido es Sin dato", () => {
    expect(effectiveOrigin(null)).toBe("SIN_DATO");
    expect(effectiveOrigin("OTRO")).toBe("SIN_DATO");
    expect(saleOriginLabel("META_ADS")).toBe("Meta Ads");
    expect(saleOriginLabel(undefined)).toBe("Sin dato");
  });
  it("?origen= acepta el enum en cualquier mayuscula", () => {
    expect(parseOriginFilter("marketplace")).toBe("MARKETPLACE");
    expect(parseOriginFilter("SIN_DATO")).toBe("SIN_DATO");
    expect(parseOriginFilter("REFERIDO_RECURRENTE")).toBeNull();
    expect(parseOriginFilter("")).toBeNull();
    expect(parseOriginFilter(["META_ADS"])).toBeNull();
  });
});

describe("respuesta del CRM por telefono", () => {
  it("encontrado con origen y detalle", () => {
    expect(
      parseCrmLookup({ encontrado: true, origin: "REFERIDO_RECURRENTE", originDetail: { crmContactId: "c1" }, linea: "Admin" }),
    ).toEqual({ encontrado: true, origin: "REFERIDO_RECURRENTE", originDetail: { crmContactId: "c1", linea: "Admin" } });
  });
  it("no encontrado", () => {
    expect(parseCrmLookup({ encontrado: false, origin: null, originDetail: null, linea: null })).toEqual({ encontrado: false });
  });
  it("respuesta invalida o encontrado sin origen es error (null)", () => {
    expect(parseCrmLookup({ encontrado: true, origin: null })).toBeNull();
    expect(parseCrmLookup({ origin: "META_ADS" })).toBeNull();
    expect(parseCrmLookup("ok")).toBeNull();
  });
});

describe("relleno", () => {
  it("sin chat: venta directa = MOSTRADOR, otra = SIN_DATO", () => {
    expect(backfillFallbackOrigin(true)).toBe("MOSTRADOR");
    expect(backfillFallbackOrigin(false)).toBe("SIN_DATO");
  });
  it("venta directa probable: cotizacion y venta nacen con segundos de diferencia", () => {
    const quoteCreatedAt = new Date("2026-09-01T15:00:00.000Z");
    expect(isProbableDirectSale({ quoteCreatedAt, saleCreatedAt: new Date("2026-09-01T15:00:00.300Z") })).toBe(true);
    expect(isProbableDirectSale({ quoteCreatedAt, saleCreatedAt: new Date("2026-09-03T12:00:00.000Z") })).toBe(false);
  });
});

describe("anuncio", () => {
  it("agrupa por id; muestra el titulo", () => {
    expect(adKeyFromDetail({ adId: "1", adTitle: "Combo" })).toEqual({ key: "1", adTitle: "Combo", adId: "1" });
    expect(adKeyFromDetail({ adTitle: "Combo" })).toEqual({ key: "Combo", adTitle: "Combo", adId: null });
    expect(adKeyFromDetail({ mkCuenta: "MK-1" })).toBeNull();
    expect(adKeyFromDetail(null)).toBeNull();
  });
  it("resumen para el MCP", () => {
    expect(originDetailSummary({ adTitle: "Combo", linea: "Ventas 1" })).toMatchObject({ anuncio: "Combo", linea: "Ventas 1", cuenta_mk: null });
    expect(originDetailSummary({})).toBeNull();
  });
});
