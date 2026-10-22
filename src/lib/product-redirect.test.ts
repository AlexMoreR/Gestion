import { describe, expect, it, vi } from "vitest";

// La decision es pura: no se toca la base en estas pruebas.
vi.mock("./prisma", () => ({ prisma: {} }));

import { codeLikeSegment, pickRedirectTarget, type RedirectCandidate } from "./product-redirect";

function product(overrides: Partial<RedirectCandidate> & { slug: string }): RedirectCandidate {
  return {
    id: overrides.slug,
    name: overrides.slug,
    code: null,
    hiddenFromStore: false,
    category: { slug: "camillas" },
    ...overrides,
  };
}

const camilla = product({ slug: "camilla-curva-cav14", code: "CAV014" });
const sillaFlor = product({ slug: "silla-flor-bmv09", code: "BMV026", category: { slug: "sillas" } });
const sillaFlorFija = product({ slug: "silla-flor-fija-bmv09", code: "BMV009", category: { slug: "sillas" } });

describe("codeLikeSegment", () => {
  it("toma el ultimo segmento con forma de codigo", () => {
    expect(codeLikeSegment("camilla-vieja-cav014")).toBe("cav014");
    expect(codeLikeSegment("CAMILLA-CAV14")).toBe("cav14");
  });

  it("rechaza palabras, puntos y segmentos raros", () => {
    expect(codeLikeSegment("recepcion-luxury-led")).toBeNull();
    expect(codeLikeSegment("camilla-cav14.php")).toBeNull();
    expect(codeLikeSegment("camilla-14cav")).toBeNull();
    expect(codeLikeSegment("camilla-")).toBeNull();
    expect(codeLikeSegment("")).toBeNull();
  });
});

describe("pickRedirectTarget", () => {
  it("codigo nuevo exacto (cav014) -> producto con ese codigo", () => {
    const target = pickRedirectTarget("camilla-nombre-viejo-cav014", { byCode: [camilla], bySuffix: [] });
    expect(target?.slug).toBe("camilla-curva-cav14");
  });

  it("sufijo viejo (cav14) con un solo candidato -> ese producto", () => {
    const target = pickRedirectTarget("camilla-nombre-viejo-cav14", { byCode: [], bySuffix: [camilla] });
    expect(target?.slug).toBe("camilla-curva-cav14");
  });

  it("no rellena ceros: cav14 no se toma como codigo CAV014", () => {
    expect(pickRedirectTarget("otra-cav14", { byCode: [camilla], bySuffix: [] })).toBeNull();
  });

  it("bmv09 con dos candidatos -> null (no adivina)", () => {
    expect(
      pickRedirectTarget("silla-vieja-bmv09", { byCode: [], bySuffix: [sillaFlor, sillaFlorFija] }),
    ).toBeNull();
  });

  it("segmento con punto o raro -> null", () => {
    expect(pickRedirectTarget("camilla-cav14.html", { byCode: [camilla], bySuffix: [camilla] })).toBeNull();
    expect(pickRedirectTarget("camilla-c@v14", { byCode: [camilla], bySuffix: [camilla] })).toBeNull();
  });

  it("candidato oculto -> null", () => {
    const oculto = product({ slug: "carrito-auxiliar-acv13", code: "ACV013", hiddenFromStore: true });
    expect(pickRedirectTarget("carrito-viejo-acv013", { byCode: [oculto], bySuffix: [] })).toBeNull();
    expect(pickRedirectTarget("carrito-viejo-acv13", { byCode: [], bySuffix: [oculto] })).toBeNull();
  });

  it("'no-existe-xyz' -> null", () => {
    expect(pickRedirectTarget("no-existe-xyz", { byCode: [], bySuffix: [] })).toBeNull();
  });

  it("nunca redirige al mismo slug pedido", () => {
    expect(pickRedirectTarget("camilla-curva-cav14", { byCode: [], bySuffix: [camilla] })).toBeNull();
  });
});
