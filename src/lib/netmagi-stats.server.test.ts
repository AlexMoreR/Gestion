import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// El proyecto no define el alias "@" para vitest: se resuelve a mano solo en esta prueba.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/netmagi-config.server", async () => await import("./netmagi-config.server"));
vi.mock("@/modules/marketplace/domain/marketplace-stats", async () => await import("../modules/marketplace/domain/marketplace-stats"));

import { getNetmagiStats } from "./netmagi-stats.server";

// NETMAGI y Gestion se despliegan por separado: la pagina debe seguir viva si NETMAGI aun no tiene /anuncios.

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const RESUMEN = { ok: true, desde: "2026-10-01", hasta: "2026-10-02", totales: { entrantes: 3 }, cuentas: { total: 1, en_vivo: 1 }, serie: [{ dia: "2026-10-02", entrantes: 3 }] };
const OK = {
  resumen: RESUMEN,
  cuentas: { ok: true, cuentas: [{ id: "1", nombre: "A", estado: "en_vivo" }] },
  productos: { ok: true, productos: [] },
  publicador: { ok: true, config: { activo: true }, hoy: {}, periodo: {}, ultimos: [], inventario: {} },
  anuncios: { ok: true, total: 1, truncado: false, anuncios: [{ id: "9", dia: "2026-10-02", url: "https://www.facebook.com/marketplace/item/9/", ciudad: "Cali", ubicacion_estimada: false }] },
  formula: {
    ok: true,
    disponible: true,
    estado_ganadora: "provisional",
    senal: "clientes",
    ganadora: { variante: "precio", nombre: "Producto + precio", tasa: 2, senal: "clientes", n: 5, ventaja_sobre_base: 100 },
    variantes: [{ variante: "precio", nombre: "Producto + precio", anuncios: 5, clientes: 10, tasa: 2, suficiente: true }],
  },
};

function mockNetmagi(overrides: Partial<Record<keyof typeof OK, Response>> = {}) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const name = new URL(url).pathname.split("/").pop() as keyof typeof OK;
      calls.push(name);
      return overrides[name] ?? json(OK[name]);
    }),
  );
  return calls;
}

describe("getNetmagiStats", () => {
  beforeEach(() => {
    vi.stubEnv("NETMAGI_FOTOS_URL", "https://netmagi.test");
    vi.stubEnv("GESTION_FOTOS_KEY", "k".repeat(30));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("trae las seis rutas una tras otra, incluidas la de anuncios y la de qué funciona", async () => {
    const calls = mockNetmagi();
    const stats = await getNetmagiStats({ desde: "2026-10-01", hasta: "2026-10-02" });
    expect(calls).toEqual(["resumen", "cuentas", "productos", "publicador", "anuncios", "formula"]);
    expect(stats.formulaFaltan).toBe(false);
    expect(stats.formula?.ganadora?.variante).toBe("precio");
    expect(stats.ok).toBe(true);
    expect(stats.error).toBeNull();
    expect(stats.anunciosFaltan).toBe(false);
    expect(stats.anuncios?.anuncios[0]).toMatchObject({ url: "https://www.facebook.com/marketplace/item/9/", ciudad: "Cali" });
  });

  it("si NETMAGI todavia no tiene /anuncios (404) el resto de la pagina funciona", async () => {
    mockNetmagi({ anuncios: json({ error: "no" }, 404) });
    const stats = await getNetmagiStats({ desde: "2026-10-01", hasta: "2026-10-02" });
    expect(stats.ok).toBe(true);
    expect(stats.error).toBeNull();
    expect(stats.anuncios).toBeNull();
    expect(stats.anunciosFaltan).toBe(true);
    expect(stats.resumen?.totales.entrantes).toBe(3);
    expect(stats.cuentas).toHaveLength(1);
  });

  it("si NETMAGI todavia no tiene /formula (404) la pagina funciona y solo falta esa seccion", async () => {
    mockNetmagi({ formula: json({ error: "no" }, 404) });
    const stats = await getNetmagiStats({ desde: "2026-10-01", hasta: "2026-10-02" });
    expect(stats.ok).toBe(true);
    expect(stats.error).toBeNull();
    expect(stats.formula).toBeNull();
    expect(stats.formulaFaltan).toBe(true);
    expect(stats.anunciosFaltan).toBe(false);
    expect(stats.anuncios).not.toBeNull();
  });

  it("si NETMAGI responde ok con disponible:false tambien se trata como ruta que falta", async () => {
    mockNetmagi({ formula: json({ ok: true, disponible: false }) });
    const stats = await getNetmagiStats({ desde: "2026-10-01", hasta: "2026-10-02" });
    expect(stats.ok).toBe(true);
    expect(stats.error).toBeNull();
    expect(stats.formulaFaltan).toBe(true);
  });

  it("si /anuncios falta y /formula esta, cada aviso es de su ruta", async () => {
    mockNetmagi({ anuncios: json({}, 404) });
    const stats = await getNetmagiStats({ desde: "2026-10-01", hasta: "2026-10-02" });
    expect(stats.anunciosFaltan).toBe(true);
    expect(stats.formulaFaltan).toBe(false);
    expect(stats.formula).not.toBeNull();
  });

  it("un NETMAGI viejo (cuentas sin los campos de hoy) se lee igual", async () => {
    mockNetmagi();
    const stats = await getNetmagiStats({ desde: "2026-10-01", hasta: "2026-10-02" });
    expect(stats.cuentas?.[0].tieneHoy).toBe(false);
  });

  it("si /resumen da 404 se sigue tratando como NETMAGI sin desplegar", async () => {
    mockNetmagi({ resumen: json({}, 404) });
    const stats = await getNetmagiStats({ desde: "2026-10-01", hasta: "2026-10-02" });
    expect(stats.ok).toBe(false);
    expect(stats.error).toMatch(/todavía no tiene las rutas/);
  });

  it("sin configuracion no llama a NETMAGI", async () => {
    vi.stubEnv("NETMAGI_FOTOS_URL", "");
    const calls = mockNetmagi();
    const stats = await getNetmagiStats({ desde: "2026-10-01", hasta: "2026-10-02" });
    expect(calls).toEqual([]);
    expect(stats.ok).toBe(false);
    expect(stats.error).toMatch(/Falta configurar/);
  });
});
