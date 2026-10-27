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

  it("trae las cinco rutas una tras otra, incluida la de anuncios", async () => {
    const calls = mockNetmagi();
    const stats = await getNetmagiStats({ desde: "2026-10-01", hasta: "2026-10-02" });
    expect(calls).toEqual(["resumen", "cuentas", "productos", "publicador", "anuncios"]);
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
