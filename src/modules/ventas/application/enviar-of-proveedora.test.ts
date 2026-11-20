import { describe, expect, it, vi } from "vitest";
import { AVISO_OF_NUMERO_PRUEBA, parseAvisoOFConfig, telefonoParaCrm, type AvisoOFConfig } from "../domain/aviso-of-proveedora";
import type { AvisoOFPlan } from "../domain/combo-camillas";
import {
  avisarCambioOFSiYaSeEnvio,
  enviarOFProveedora,
  type AvisoCambioDatos,
  type AvisoCambioPuertos,
  type AvisoOFDatos,
  type AvisoOFPuertos,
} from "./enviar-of-proveedora";
import { AVISO_PRODUCTO_CANCELADO, mensajeAvisoOF } from "../../../lib/sale-item-cancel";

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

// ── Parte 4: el cambio de una OF ya enviada ──
function cambio(extra: Partial<AvisoCambioDatos> = {}): AvisoCambioDatos {
  return {
    ofCode: "OF-00035",
    estadoOF: "ENVIADO",
    telefonoProveedora: "300 123 4567",
    mensaje: mensajeAvisoOF({
      code: "OF-00035",
      producto: "Combo Camilla Diván",
      colorViejo: "negro",
      colorNuevo: "blanco",
      url: "https://magilus.com/fabricacion/abc",
    }),
    esCambioDeColor: true,
    imagenUrl: "https://magilus.com/uploads/combo-blanco.webp",
    ...extra,
  };
}

// El candado se comporta como el updateMany "where whatsappEstado IS NULL".
function puertosCambio(config: AvisoOFConfig, cargado: AvisoCambioDatos | null = cambio()) {
  let estadoGuardado: string | null = null;
  const bitacora: Array<{ estado: string; destino: string | null; detalle: string }> = [];
  const puertos: AvisoCambioPuertos = {
    leerConfig: async () => config,
    cargar: async () => cargado,
    tomar: async () => {
      if (estadoGuardado !== null) return false;
      estadoGuardado = "ENVIANDO";
      return true;
    },
    marcar: async (_id, estado) => {
      estadoGuardado = estado;
    },
    bitacora: async (entrada) => {
      bitacora.push({ estado: entrada.estado, destino: entrada.destino, detalle: entrada.detalle });
    },
  };
  return { puertos, bitacora, estado: () => estadoGuardado };
}

describe("avisarCambioOFSiYaSeEnvio", () => {
  it("OF no enviada no manda nada", async () => {
    for (const estadoOF of [null, "ENVIANDO", "ALERTA", "FALLIDO"]) {
      const f = puertosCambio(proveedoras, cambio({ estadoOF }));
      const fetch = fetchOk();
      expect(await avisarCambioOFSiYaSeEnvio("a1", f.puertos, { fetch, env, esperar: sinEspera })).toBeNull();
      expect(fetch).not.toHaveBeenCalled();
      expect(f.estado()).toBeNull();
      expect(f.bitacora).toHaveLength(0);
    }
  });

  it("OF enviada manda un solo mensaje: el cambio con la foto del color nuevo, sin la OF completa", async () => {
    const f = puertosCambio(proveedoras);
    const fetch = fetchOk();
    expect(await avisarCambioOFSiYaSeEnvio("a1", f.puertos, { fetch, env, esperar: sinEspera })).toBe("ENVIADO");
    expect(fetch).toHaveBeenCalledTimes(1);
    const enviado = cuerpo(fetch);
    expect(enviado).toEqual({
      linea: "Admin",
      telefono: "573001234567",
      texto: "Cambio de color en OF-35: Combo Camilla Diván pasa de negro a blanco\nhttps://magilus.com/fabricacion/abc",
      imagenUrl: "https://magilus.com/uploads/combo-blanco.webp",
    });
    expect(enviado.texto).not.toContain("te mando la orden");
    expect(f.estado()).toBe("ENVIADO");
    expect(f.bitacora).toHaveLength(1);
  });

  it("el mismo aviso no sale dos veces", async () => {
    const f = puertosCambio(proveedoras);
    const fetch = fetchOk();
    await avisarCambioOFSiYaSeEnvio("a1", f.puertos, { fetch, env, esperar: sinEspera });
    expect(await avisarCambioOFSiYaSeEnvio("a1", f.puertos, { fetch, env, esperar: sinEspera })).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("apagado: no sale nada", async () => {
    const f = puertosCambio({ modo: "apagado", numeroPrueba: AVISO_OF_NUMERO_PRUEBA });
    const fetch = fetchOk();
    expect(await avisarCambioOFSiYaSeEnvio("a1", f.puertos, { fetch, env, esperar: sinEspera })).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    expect(f.estado()).toBeNull();
  });

  it("si la OF solo salió en prueba, el cambio va al número de prueba aunque esté en Proveedoras", async () => {
    const f = puertosCambio(proveedoras, cambio({ estadoOF: "PRUEBA" }));
    const fetch = fetchOk();
    expect(await avisarCambioOFSiYaSeEnvio("a1", f.puertos, { fetch, env, esperar: sinEspera })).toBe("PRUEBA");
    expect(cuerpo(fetch).telefono).toBe(AVISO_OF_NUMERO_PRUEBA);
  });

  it("color sin foto: el texto sale sin imagen y le llega la alerta al dueño", async () => {
    const f = puertosCambio(proveedoras, cambio({ imagenUrl: null }));
    const fetch = fetchOk();
    expect(await avisarCambioOFSiYaSeEnvio("a1", f.puertos, { fetch, env, esperar: sinEspera })).toBe("ENVIADO");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(cuerpo(fetch, 0)).toMatchObject({ telefono: "573001234567", imagenUrl: null });
    expect(cuerpo(fetch, 1)).toMatchObject({ telefono: AVISO_OF_NUMERO_PRUEBA, imagenUrl: null });
    expect(cuerpo(fetch, 1).texto).toMatch(/^El cambio de color de la OF-35 salió sin foto\./);
    expect(f.bitacora[0].detalle).toContain("alerta al dueño");
  });

  it("producto cancelado: solo el texto, sin foto ni alerta", async () => {
    const mensaje = mensajeAvisoOF({ code: "OF-00035", producto: "Combo Camilla Diván", colorViejo: "negro", colorNuevo: AVISO_PRODUCTO_CANCELADO, url: "https://magilus.com/fabricacion/abc" });
    const f = puertosCambio(prueba, cambio({ mensaje, esCambioDeColor: false, imagenUrl: null }));
    const fetch = fetchOk();
    expect(await avisarCambioOFSiYaSeEnvio("a1", f.puertos, { fetch, env, esperar: sinEspera })).toBe("PRUEBA");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(cuerpo(fetch).texto).toBe("OF-35: Producto cancelado: Combo Camilla Diván. Ya no se fabrica.\nhttps://magilus.com/fabricacion/abc");
  });

  it("el CRM no responde: queda FALLIDO en la bitácora", async () => {
    const f = puertosCambio(proveedoras);
    const fetch = vi.fn(async () => new Response("", { status: 500 }));
    expect(await avisarCambioOFSiYaSeEnvio("a1", f.puertos, { fetch, env, esperar: sinEspera })).toBe("FALLIDO");
    expect(f.bitacora[0].estado).toBe("FALLIDO");
  });
});
