import { describe, expect, it, vi } from "vitest";
import { CARTA_CACHE_MS, crearLectorCarta, parseCartaColores } from "./carta-colores-crm";

const respuesta = {
  materiales: [
    {
      nombre: "Prana",
      tipo: "x",
      orden: 2,
      colores: [{ id: "c3", codigo: "P-01", nombre: "Gris", fotoUrl: "https://crm.magilus.com/f/p1.jpg", orden: 1 }],
    },
    {
      nombre: "Cuerotex",
      tipo: "x",
      orden: 1,
      colores: [
        { id: "c2", codigo: "C-02", nombre: "Negro", fotoUrl: "javascript:alert(1)", orden: 2 },
        { id: "c1", codigo: "C-01", nombre: "Blanco", fotoUrl: "https://crm.magilus.com/f/c1.jpg", orden: 1 },
        { id: "c9", codigo: "", nombre: "Sin codigo", fotoUrl: null, orden: 0 },
        { id: "c8", codigo: "C-08", nombre: "  ", orden: 0 },
      ],
    },
    { nombre: "Telas", orden: 3, colores: [] },
  ],
};

describe("parseCartaColores", () => {
  it("ordena, descarta colores sin codigo o sin nombre y fotos que no son http(s)", () => {
    expect(parseCartaColores(respuesta)).toEqual([
      {
        nombre: "Cuerotex",
        colores: [
          { codigo: "C-01", nombre: "Blanco", fotoUrl: "https://crm.magilus.com/f/c1.jpg" },
          { codigo: "C-02", nombre: "Negro", fotoUrl: "" },
        ],
      },
      { nombre: "Prana", colores: [{ codigo: "P-01", nombre: "Gris", fotoUrl: "https://crm.magilus.com/f/p1.jpg" }] },
    ]);
  });

  it("devuelve null si la respuesta no trae materiales", () => {
    expect(parseCartaColores({ error: "no autorizado" })).toBeNull();
    expect(parseCartaColores(null)).toBeNull();
  });
});

describe("crearLectorCarta", () => {
  const deps = (over: Partial<Parameters<typeof crearLectorCarta>[0]> = {}) => ({
    pedirAlCrm: vi.fn(async () => respuesta as unknown),
    leerCopia: vi.fn(async () => null as string | null),
    guardarCopia: vi.fn(async () => undefined),
    ahora: () => 0,
    ...over,
  });

  it("lee del CRM, guarda la copia y no vuelve a pedir antes de 5 minutos", async () => {
    let t = 0;
    const d = deps({ ahora: () => t });
    const leer = crearLectorCarta(d);
    expect((await leer()).origen).toBe("crm");
    expect(d.guardarCopia).toHaveBeenCalledTimes(1);
    t = CARTA_CACHE_MS - 1;
    await leer();
    expect(d.pedirAlCrm).toHaveBeenCalledTimes(1);
    t = CARTA_CACHE_MS;
    await leer();
    expect(d.pedirAlCrm).toHaveBeenCalledTimes(2);
  });

  it("si el CRM falla devuelve la copia guardada", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const leer = crearLectorCarta(
      deps({
        pedirAlCrm: vi.fn(async () => {
          throw new Error("el CRM respondio 401");
        }),
        leerCopia: vi.fn(async () => JSON.stringify(respuesta)),
      }),
    );
    const carta = await leer();
    expect(carta.origen).toBe("copia");
    expect(carta.materiales.map((m) => m.nombre)).toEqual(["Cuerotex", "Prana"]);
  });

  it("sin CRM y sin copia queda vacia (se escribe el color a mano)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const leer = crearLectorCarta(deps({ pedirAlCrm: vi.fn(async () => ({ error: "x" })) }));
    expect(await leer()).toEqual({ materiales: [], origen: "nada" });
  });
});
