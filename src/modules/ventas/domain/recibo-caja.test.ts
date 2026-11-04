import { inflateSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import { armarReciboCaja, estadoPedido, type ReciboVenta } from "./recibo-caja";
import {
  armarCuerpoRecibo,
  enviarReciboCaja,
  postReciboAlCrm,
  type ReciboCajaPuertos,
} from "../application/enviar-recibo-caja";

const venta = (cambios: Partial<ReciboVenta> = {}): ReciboVenta => ({
  code: "SAL-00123",
  total: 1_000_000,
  clienteNombre: "Ana Pérez",
  clienteTelefono: "3001234567",
  productos: ["Silla barbera", "2 x Butaco"],
  asesora: "Ingrid",
  orderStatus: null,
  pagos: [
    // 10-oct escrita por la persona (medianoche UTC) y un momento real del 4-nov a las 9 p. m. en Colombia.
    { id: "p1", amount: 300_000, paymentDate: new Date("2026-10-10T00:00:00Z"), createdAt: new Date(), isWithholding: false },
    { id: "p2", amount: 200_000, paymentDate: new Date("2026-11-05T02:00:00Z"), createdAt: new Date(), isWithholding: false },
  ],
  ...cambios,
});

// Texto que dibujó pdf-lib: va en hexadecimal (WinAnsi) dentro de streams comprimidos.
function textoDelPdf(pdf: Buffer): string {
  const crudo = pdf.toString("latin1");
  let hex = "";
  for (const m of crudo.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    try {
      hex += inflateSync(Buffer.from(m[1], "latin1")).toString("latin1");
    } catch {
      // stream sin comprimir o que no es de texto
    }
  }
  return hex.toUpperCase();
}
const hexDe = (texto: string) => Buffer.from(texto, "latin1").toString("hex").toUpperCase();

describe("recibo de caja: reglas", () => {
  it("estadoPedido: sin orden o en producción → FABRICACION; DISPATCHED → DESPACHADO; COMPLETED → ENTREGADO", () => {
    expect(estadoPedido(null)).toBe("FABRICACION");
    expect(estadoPedido("IN_PRODUCTION")).toBe("FABRICACION");
    expect(estadoPedido("READY_FOR_DISPATCH")).toBe("FABRICACION");
    expect(estadoPedido("DISPATCHED")).toBe("DESPACHADO");
    expect(estadoPedido("COMPLETED")).toBe("ENTREGADO");
  });

  it("varias cuotas → un solo recibo con la suma, el id del primero y saldo = total − pagado", () => {
    const recibo = armarReciboCaja(venta(), ["p1", "p2"]);
    expect(recibo).toMatchObject({ reciboId: "p1", ventaCodigo: "SAL-123", valorAbonado: 500_000, saldo: 500_000 });
    expect(recibo?.cliente).toEqual({ nombre: "Ana Pérez", telefono: "3001234567" });
    expect(recibo?.producto).toBe("Silla barbera, 2 x Butaco");
  });

  it("fecha en AAAA-MM-DD hora Colombia (un abono suelto)", () => {
    expect(armarReciboCaja(venta(), ["p2"])?.fecha).toBe("2026-11-04");
    expect(armarReciboCaja(venta(), ["p1"])?.fecha).toBe("2026-10-10");
  });

  it("la retención en la fuente no lleva recibo pero sí cuenta para el saldo", () => {
    const v = venta({
      pagos: [...venta().pagos, { id: "r1", amount: 100_000, paymentDate: null, createdAt: new Date(), isWithholding: true }],
    });
    expect(armarReciboCaja(v, ["r1"])).toBeNull();
    expect(armarReciboCaja(v, ["p2"])?.saldo).toBe(400_000);
  });
});

describe("recibo de caja: PDF y envío", () => {
  const datos = armarReciboCaja(venta(), ["p1", "p2"])!;

  it("el PDF sale en base64 que empieza por JVBER y trae Magilus y la dirección", async () => {
    const cuerpo = await armarCuerpoRecibo(datos);
    expect(cuerpo.pdfBase64.startsWith("JVBER")).toBe(true);
    expect(cuerpo.nombreArchivo).toBe("recibo-de-caja-SAL-123-2026-11-04.pdf");
    const texto = textoDelPdf(Buffer.from(cuerpo.pdfBase64, "base64"));
    expect(texto).toContain(hexDe("Magilus"));
    expect(texto).toContain(hexDe("Cali - Bogotá, Colombia"));
  });

  it("manda a la dirección por defecto con Authorization: Bearer y el cuerpo pedido", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    const cuerpo = await armarCuerpoRecibo(datos);
    const ok = await postReciboAlCrm(cuerpo, { fetch: fetchMock as unknown as typeof fetch, env: { CRM_API_KEY: "llave-crm" } });
    expect(ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://crm.magilus.com/api/gestion/recibo-de-caja");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer llave-crm");
    const enviado = JSON.parse(init.body as string);
    expect(Object.keys(enviado).sort()).toEqual(
      ["asesora", "cliente", "estadoPedido", "fecha", "nombreArchivo", "pdfBase64", "producto", "reciboId", "saldo", "valorAbonado", "ventaCodigo"].sort(),
    );
  });

  it("CRM_RECIBO_URL cambia la dirección y la llave cae a CATALOGO_API_KEY", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    await postReciboAlCrm(await armarCuerpoRecibo(datos), {
      fetch: fetchMock as unknown as typeof fetch,
      env: { CRM_RECIBO_URL: "https://otro.test/recibo", CATALOGO_API_KEY: "llave-cat" },
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://otro.test/recibo");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer llave-cat");
  });

  it("si todo falla: 4 intentos (esperas 2, 8 y 30 s) y el abono queda FALLIDO", async () => {
    const fetchMock = vi.fn(async () => new Response("caido", { status: 503 }));
    const esperas: number[] = [];
    const marcar = vi.fn(async () => undefined);
    const puertos: ReciboCajaPuertos = { cargarVenta: async () => venta(), marcar };
    const estado = await enviarReciboCaja("s1", ["p2"], puertos, {
      fetch: fetchMock as unknown as typeof fetch,
      env: { MCP_API_KEY: "llave-mcp" },
      esperar: async (ms) => void esperas.push(ms),
    });
    expect(estado).toBe("FALLIDO");
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(esperas).toEqual([2_000, 8_000, 30_000]);
    expect(marcar).toHaveBeenCalledWith(["p2"], "FALLIDO", expect.any(Date));
  });

  it("si el CRM responde bien marca ENVIADO; con RECIBO_CAJA_AVISO=off no manda nada", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    const marcar = vi.fn(async () => undefined);
    const puertos: ReciboCajaPuertos = { cargarVenta: async () => venta(), marcar };
    const deps = { fetch: fetchMock as unknown as typeof fetch, esperar: async () => undefined };
    expect(await enviarReciboCaja("s1", ["p1", "p2"], puertos, { ...deps, env: { CRM_API_KEY: "k" } })).toBe("ENVIADO");
    expect(marcar).toHaveBeenCalledWith(["p1", "p2"], "ENVIADO", expect.any(Date));
    fetchMock.mockClear();
    marcar.mockClear();
    expect(await enviarReciboCaja("s1", ["p1"], puertos, { ...deps, env: { CRM_API_KEY: "k", RECIBO_CAJA_AVISO: "off" } })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(marcar).not.toHaveBeenCalled();
  });
});
