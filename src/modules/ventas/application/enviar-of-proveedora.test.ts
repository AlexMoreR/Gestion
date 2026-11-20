import { describe, expect, it, vi } from "vitest";
import { AVISO_OF_NUMERO_PRUEBA, parseAvisoOFConfig, telefonoParaCrm, type AvisoOFConfig } from "../domain/aviso-of-proveedora";
import type { AvisoOFPlan } from "../domain/combo-camillas";
import { enviarOFProveedora, type AvisoOFDatos, type AvisoOFPuertos } from "./enviar-of-proveedora";

const env = { CRM_API_KEY: "llave-de-prueba" };
const sinEspera = async () => undefined;

function datos(plan: AvisoOFPlan = { accion: "enviar" }): AvisoOFDatos {
  return {
    ofCode: "OF-00035",
    orderCode: "ORD-00120",
    plan,
    telefonoProveedora: "300 123 4567",
    mensaje: "Hola Laura, te mando la orden OF-35 (ORD-120) para fabricar:",
    imagenUrl: "https://magilus.com/uploads/combo-negro.webp",
  };
}

// Puertos falsos: el candado se comporta como el updateMany "where avisoProveedoraEstado IS NULL".
function puertosFalsos(config: AvisoOFConfig, cargado: AvisoOFDatos | null = datos()) {
  let estadoGuardado: string | null = null;
  const marcas: Array<{ estado: string; destino: string | null }> = [];
  const bitacora: Array<{ estado: string; destino: string | null }> = [];
  const puertos: AvisoOFPuertos = {
    leerConfig: async () => config,
    cargar: async () => cargado,
    tomar: async () => {
      if (estadoGuardado !== null) return false;
      estadoGuardado = "ENVIANDO";
      return true;
    },
    marcar: async (_id, estado, _en, destino) => {
      estadoGuardado = estado;
      marcas.push({ estado, destino });
    },
    bitacora: async (entrada) => {
      bitacora.push({ estado: entrada.estado, destino: entrada.destino });
    },
  };
  return { puertos, marcas, bitacora, estado: () => estadoGuardado };
}

function fetchOk() {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response("{}", { status: 200 }));
}

function cuerpo(fetch: ReturnType<typeof fetchOk>, n = 0) {
  return JSON.parse(String(fetch.mock.calls[n][1]?.body));
}

const prueba: AvisoOFConfig = { modo: "prueba", numeroPrueba: AVISO_OF_NUMERO_PRUEBA };
const proveedoras: AvisoOFConfig = { modo: "proveedoras", numeroPrueba: AVISO_OF_NUMERO_PRUEBA };

describe("enviarOFProveedora: interruptor", () => {
  it("apagado: no manda nada y no marca nada", async () => {
    const f = puertosFalsos({ modo: "apagado", numeroPrueba: AVISO_OF_NUMERO_PRUEBA });
    const fetch = fetchOk();
    expect(await enviarOFProveedora("of1", f.puertos, { fetch, env, esperar: sinEspera })).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    expect(f.estado()).toBeNull();
    expect(f.bitacora).toHaveLength(0);
  });

  it("prueba: el mismo mensaje con la foto sale al número del dueño y queda PRUEBA", async () => {
    const f = puertosFalsos(prueba);
    const fetch = fetchOk();
    expect(await enviarOFProveedora("of1", f.puertos, { fetch, env, esperar: sinEspera })).toBe("PRUEBA");
    expect(fetch.mock.calls[0][0]).toBe("https://crm.magilus.com/api/gestion/whatsapp-proveedora");
    expect(cuerpo(fetch)).toEqual({
      linea: "Admin",
      telefono: "573196892277",
      texto: datos().mensaje,
      imagenUrl: "https://magilus.com/uploads/combo-negro.webp",
    });
    expect(f.marcas).toEqual([{ estado: "PRUEBA", destino: "573196892277" }]);
    expect(f.bitacora).toEqual([{ estado: "PRUEBA", destino: "573196892277" }]);
  });

  it("proveedoras: sale al teléfono de la proveedora con el 57 adelante y queda ENVIADO", async () => {
    const f = puertosFalsos(proveedoras);
    const fetch = fetchOk();
    const url = "https://crm.example/whatsapp";
    expect(await enviarOFProveedora("of1", f.puertos, { fetch, env: { ...env, CRM_OF_WHATSAPP_URL: url }, esperar: sinEspera })).toBe("ENVIADO");
    expect(fetch.mock.calls[0][0]).toBe(url);
    expect(cuerpo(fetch).telefono).toBe("573001234567");
    expect(f.marcas).toEqual([{ estado: "ENVIADO", destino: "573001234567" }]);
  });

  it("de bodega (plan nada) o sin combo: no hace nada", async () => {
    for (const cargado of [datos({ accion: "nada" }), null]) {
      const f = puertosFalsos(proveedoras, cargado);
      const fetch = fetchOk();
      expect(await enviarOFProveedora("of1", f.puertos, { fetch, env, esperar: sinEspera })).toBeNull();
      expect(fetch).not.toHaveBeenCalled();
      expect(f.estado()).toBeNull();
    }
  });
});

describe("enviarOFProveedora: candado y fallos", () => {
  it("la misma OF nunca sale dos veces (aunque se dispare dos veces a la vez)", async () => {
    const f = puertosFalsos(proveedoras);
    const fetch = fetchOk();
    const resultados = await Promise.all([
      enviarOFProveedora("of1", f.puertos, { fetch, env, esperar: sinEspera }),
      enviarOFProveedora("of1", f.puertos, { fetch, env, esperar: sinEspera }),
    ]);
    expect(resultados.filter(Boolean)).toEqual(["ENVIADO"]);
    expect(await enviarOFProveedora("of1", f.puertos, { fetch, env, esperar: sinEspera })).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("alerta: la OF no sale; al dueño le llega el aviso y queda ALERTA", async () => {
    const f = puertosFalsos(proveedoras, datos({ accion: "alerta", motivo: "falta_foto_color", color: "Negro" }));
    const fetch = fetchOk();
    expect(await enviarOFProveedora("of1", f.puertos, { fetch, env, esperar: sinEspera })).toBe("ALERTA");
    const enviado = cuerpo(fetch);
    expect(enviado.telefono).toBe("573196892277");
    expect(enviado.imagenUrl).toBeNull();
    expect(enviado.texto).toContain("OF-35");
    expect(enviado.texto).toContain("Falta la foto del combo color Negro");
    expect(enviado.texto).not.toContain("te mando la orden");
    expect(f.marcas).toEqual([{ estado: "ALERTA", destino: "573196892277" }]);
  });

  it("el CRM no responde (o la ruta no existe): reintenta y queda FALLIDO sin lanzar", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const f = puertosFalsos(prueba);
    const fetch = vi.fn(async () => new Response("no", { status: 404 }));
    expect(await enviarOFProveedora("of1", f.puertos, { fetch, env, esperar: sinEspera })).toBe("FALLIDO");
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(f.marcas).toEqual([{ estado: "FALLIDO", destino: "573196892277" }]);
    error.mockRestore();
  });

  it("proveedora con teléfono que no sirve: no manda y queda FALLIDO", async () => {
    const f = puertosFalsos(proveedoras, { ...datos(), telefonoProveedora: "12345678" });
    const fetch = fetchOk();
    expect(await enviarOFProveedora("of1", f.puertos, { fetch, env, esperar: sinEspera })).toBe("FALLIDO");
    expect(fetch).not.toHaveBeenCalled();
    expect(f.marcas).toEqual([{ estado: "FALLIDO", destino: null }]);
  });

  it("si leer la configuración falla, no lanza ni manda", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const f = puertosFalsos(prueba);
    f.puertos.leerConfig = async () => {
      throw new Error("base caída");
    };
    const fetch = fetchOk();
    expect(await enviarOFProveedora("of1", f.puertos, { fetch, env, esperar: sinEspera })).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    error.mockRestore();
  });
});

describe("parseAvisoOFConfig y telefonoParaCrm", () => {
  it("vacío, roto o con modo desconocido: prueba al número del dueño", () => {
    for (const raw of [null, "", "{", "[]", '{"modo":"todos"}', '{"modo":"proveedoras","numeroPrueba":"12"}']) {
      const config = parseAvisoOFConfig(raw);
      expect(config.numeroPrueba).toBe("573196892277");
      if (raw !== '{"modo":"proveedoras","numeroPrueba":"12"}') expect(config.modo).toBe("prueba");
    }
  });

  it("lee los tres modos y el número de prueba", () => {
    expect(parseAvisoOFConfig('{"modo":"apagado"}').modo).toBe("apagado");
    expect(parseAvisoOFConfig('{"modo":"proveedoras","numeroPrueba":"3001112233"}')).toEqual({
      modo: "proveedoras",
      numeroPrueba: "573001112233",
    });
  });

  it("deja el 57 adelante", () => {
    expect(telefonoParaCrm("300 123 4567")).toBe("573001234567");
    expect(telefonoParaCrm("+57 300-123-4567")).toBe("573001234567");
    expect(telefonoParaCrm("573001234567")).toBe("573001234567");
    expect(telefonoParaCrm("1234")).toBeNull();
    expect(telefonoParaCrm(null)).toBeNull();
  });
});
