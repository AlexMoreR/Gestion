import { describe, expect, it, vi } from "vitest";

import {
  armarProductoDelCatalogo,
  leerFiltrosDelCatalogo,
  whereDeFiltros,
  type ProductoDelCatalogo,
  type ProductoFuente,
} from "../domain/producto-del-catalogo";
import { handleCatalogoByCode, handleCatalogoList, type CatalogoDeps } from "./catalogo-http";

const KEY = "llave-de-prueba-suficientemente-larga-123";
const AHORA = new Date("2026-10-22T15:00:00Z");

function fuente(overrides: Partial<ProductoFuente> = {}): ProductoFuente {
  return {
    id: "p1",
    code: " SIL001 ",
    slug: "silla-barbera-sil001",
    name: "Silla barbera",
    description: "  Hidraulica  ",
    price: "1200000",
    regularPrice: null,
    promoPrice: null,
    promoStartsAt: null,
    promoEndsAt: null,
    wholesalePrice: "1000000",
    minWholesaleQty: 3,
    isBundle: false,
    hiddenFromStore: false,
    thumbnailUrl: "/uploads/a.jpg",
    updatedAt: new Date("2026-10-20T10:00:00Z"),
    category: { name: "Sillas", slug: "sillas-barberas" },
    images: [
      { url: "/uploads/b.jpg", order: 1 },
      { url: "/uploads/a.jpg", order: 0 },
      { url: "/file.svg", order: 2 },
    ],
    ...overrides,
  };
}

describe("armarProductoDelCatalogo", () => {
  it("conserva los campos viejos tal cual", () => {
    const p = armarProductoDelCatalogo(fuente(), AHORA);
    expect(p).toMatchObject({
      id: "p1",
      codigo: "SIL001",
      nombre: "Silla barbera",
      descripcion: "Hidraulica",
      categoria: "Sillas",
      precio: 1200000,
      precio_mayorista: 1000000,
      cantidad_minima_mayorista: 3,
      es_combo: false,
      oculto: false,
      actualizado_el: "2026-10-20T10:00:00.000Z",
    });
    // Mismo orden que antes: miniatura primero, luego la galeria tal como viene de la base.
    expect(p.imagenes).toEqual(["https://magilus.com/uploads/a.jpg", "https://magilus.com/uploads/b.jpg"]);
  });

  it("agrega slug, url, categoria_slug, precios y fotos en orden", () => {
    const p = armarProductoDelCatalogo(fuente(), AHORA);
    expect(p.slug).toBe("silla-barbera-sil001");
    expect(p.url).toBe("https://magilus.com/sillas-barberas/silla-barbera-sil001");
    expect(p.categoria_slug).toBe("sillas-barberas");
    expect(p.precio_vigente).toBe(1200000);
    expect(p.precio_normal).toBe(1200000);
    expect(p.oferta).toBeNull();
    expect(p.fotos).toEqual([
      { url: "https://magilus.com/uploads/a.jpg", orden: 0 },
      { url: "https://magilus.com/uploads/b.jpg", orden: 1 },
    ]);
  });

  it("sin categoria la url va por /productos/ y sin galeria la foto es la miniatura", () => {
    const p = armarProductoDelCatalogo(fuente({ category: null, images: [] }), AHORA);
    expect(p.url).toBe("https://magilus.com/productos/silla-barbera-sil001");
    expect(p.categoria).toBeNull();
    expect(p.categoria_slug).toBeNull();
    expect(p.fotos).toEqual([{ url: "https://magilus.com/uploads/a.jpg", orden: 0 }]);
  });

  it("con oferta vigente entrega precio_vigente y oferta; `precio` no cambia", () => {
    const p = armarProductoDelCatalogo(
      fuente({
        regularPrice: "1400000",
        promoPrice: "1100000",
        promoStartsAt: new Date("2026-10-01T05:00:00Z"),
        promoEndsAt: new Date("2026-10-31T04:59:59.999Z"),
      }),
      AHORA,
    );
    expect(p.precio).toBe(1200000);
    expect(p.precio_vigente).toBe(1100000);
    expect(p.precio_normal).toBe(1400000);
    expect(p.oferta).toEqual({ precio: 1100000, precio_normal: 1400000, desde: "2026-10-01", hasta: "2026-10-30" });
  });

  it("oferta vencida = sin oferta", () => {
    const p = armarProductoDelCatalogo(
      fuente({
        promoPrice: "1100000",
        promoStartsAt: new Date("2026-09-01T05:00:00Z"),
        promoEndsAt: new Date("2026-09-30T04:59:59.999Z"),
      }),
      AHORA,
    );
    expect(p.oferta).toBeNull();
    expect(p.precio_vigente).toBe(1200000);
  });

  it("no expone costo ni margen", () => {
    const p = armarProductoDelCatalogo(fuente({ ...({ cost: 1, margin: 2 } as object) }), AHORA);
    expect(Object.keys(p)).not.toContain("cost");
    expect(JSON.stringify(p)).not.toMatch(/cost|margen|margin/i);
  });
});

describe("filtros", () => {
  const leer = (qs: string) => leerFiltrosDelCatalogo(new URLSearchParams(qs));

  it("sin parametros = todos, tambien ocultos (como antes)", () => {
    expect(leer("")).toEqual({ ok: true, filtros: { codigo: undefined, categoriaSlug: undefined, incluirOcultos: true } });
    expect(whereDeFiltros({ incluirOcultos: true })).toEqual({});
  });

  it("code, categoria e incluirOcultos=0", () => {
    const r = leer("code=sil001&categoria=Sillas-Barberas&incluirOcultos=0");
    expect(r).toEqual({ ok: true, filtros: { codigo: "sil001", categoriaSlug: "sillas-barberas", incluirOcultos: false } });
    if (!r.ok) throw new Error();
    expect(whereDeFiltros(r.filtros)).toEqual({
      code: { equals: "sil001", mode: "insensitive" },
      category: { slug: "sillas-barberas" },
      hiddenFromStore: false,
    });
  });

  it("incluirOcultos invalido = error", () => {
    expect(leer("incluirOcultos=talvez")).toEqual({ ok: false, error: "incluirOcultos debe ser 0 o 1" });
    expect(leer("incluirOcultos=1")).toMatchObject({ ok: true, filtros: { incluirOcultos: true } });
  });
});

describe("HTTP", () => {
  const producto = armarProductoDelCatalogo(fuente(), AHORA);

  function deps(overrides: Partial<CatalogoDeps> = {}): CatalogoDeps {
    return {
      expectedKey: KEY,
      listar: vi.fn(async () => [producto] as ProductoDelCatalogo[]),
      buscarPorCodigo: vi.fn(async (codigo: string) => (codigo.toUpperCase() === "SIL001" ? producto : null)),
      ahora: () => AHORA,
      ...overrides,
    };
  }
  const conLlave = (url: string) => new Request(url, { headers: { Authorization: `Bearer ${KEY}` } });

  it("lista: 401 sin llave o con llave mala", async () => {
    const d = deps();
    expect((await handleCatalogoList(new Request("https://x/api/catalogo/productos"), d)).status).toBe(401);
    const mala = new Request("https://x/api/catalogo/productos", { headers: { "x-api-key": "otra-llave-bastante-larga-0000" } });
    expect((await handleCatalogoList(mala, d)).status).toBe(401);
    expect(d.listar).not.toHaveBeenCalled();
  });

  it("lista: 401 si la llave configurada es corta", async () => {
    const r = await handleCatalogoList(conLlave("https://x/api/catalogo/productos"), deps({ expectedKey: "corta" }));
    expect(r.status).toBe(401);
  });

  it("lista: 200 con la forma de siempre y pasa los filtros", async () => {
    const d = deps();
    const r = await handleCatalogoList(conLlave("https://x/api/catalogo/productos?categoria=sillas-barberas"), d);
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    const body = await r.json();
    expect(body).toEqual({ generado_el: AHORA.toISOString(), total: 1, productos: [JSON.parse(JSON.stringify(producto))] });
    expect(d.listar).toHaveBeenCalledWith({ codigo: undefined, categoriaSlug: "sillas-barberas", incluirOcultos: true });
  });

  it("lista: x-api-key tambien sirve; 400 con filtro invalido", async () => {
    const r = await handleCatalogoList(
      new Request("https://x/api/catalogo/productos?incluirOcultos=x", { headers: { "x-api-key": KEY } }),
      deps(),
    );
    expect(r.status).toBe(400);
  });

  it("por codigo: 200 sin distinguir mayusculas", async () => {
    const r = await handleCatalogoByCode(conLlave("https://x/api/catalogo/productos/sil001"), "sil001", deps());
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.producto.codigo).toBe("SIL001");
    expect(body.generado_el).toBe(AHORA.toISOString());
  });

  it("por codigo: 404 JSON si no existe, 401 sin llave", async () => {
    const d = deps();
    const r = await handleCatalogoByCode(conLlave("https://x/api/catalogo/productos/NOP999"), "NOP999", d);
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: "No encontrado", codigo: "NOP999" });

    const sin = await handleCatalogoByCode(new Request("https://x/api/catalogo/productos/SIL001"), "SIL001", d);
    expect(sin.status).toBe(401);
    expect(d.buscarPorCodigo).toHaveBeenCalledTimes(1);
  });
});
