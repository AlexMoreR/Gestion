import { describe, expect, it } from "vitest";

import { ALFABETO_CODIGO, esCodigoBienFormado, formatearCodigo, generarCodigoAcceso, normalizarCodigo } from "./codigo";
import { armarTablero, filasCsv, fotosDeLaDuda, respuestaVigentePorDuda, validarRespuesta, type Duda, type Respuesta } from "./duda";
import { crearFrenoIntentos, ipDelCliente } from "./freno-intentos";
import { idDesdeArchivo, leerPreguntaExportada, leerRespuestaExportada } from "./importacion";
import { crearTokenSesion, leerTokenSesion, secretoSesionDudas } from "./sesion";

describe("codigo", () => {
  it("no usa letras confusas y tiene 6 caracteres", () => {
    for (const confusa of ["0", "O", "1", "I", "L"]) expect(ALFABETO_CODIGO).not.toContain(confusa);
    for (let i = 0; i < 50; i += 1) {
      const c = generarCodigoAcceso();
      expect(c).toHaveLength(6);
      expect(esCodigoBienFormado(c)).toBe(true);
    }
  });

  it("normaliza lo que escribe la persona", () => {
    expect(normalizarCodigo(" abc-234 ")).toBe("ABC234");
    expect(formatearCodigo("ABC234")).toBe("ABC 234");
    expect(esCodigoBienFormado("ABC23O")).toBe(false);
  });
});

describe("sesion", () => {
  it("firma y lee; rechaza vencida o alterada", () => {
    const t = crearTokenSesion({ accesoId: "a1", nombre: "Ingrid" }, "s", 1000)!;
    expect(leerTokenSesion(t, "s", 2000)).toMatchObject({ accesoId: "a1", nombre: "Ingrid" });
    expect(leerTokenSesion(t, "s", 1000 + 30 * 24 * 3600_000)).toBeNull();
    expect(leerTokenSesion(t, "otro", 2000)).toBeNull();
    expect(leerTokenSesion(`${t}x`, "s", 2000)).toBeNull();
    expect(crearTokenSesion({ accesoId: "a1", nombre: "x" }, "")).toBeNull();
  });

  it("usa DUDAS_SESSION_SECRET y si no, deriva uno de AUTH_SECRET", () => {
    expect(secretoSesionDudas({ DUDAS_SESSION_SECRET: "propio", AUTH_SECRET: "auth" })).toBe("propio");
    const derivado = secretoSesionDudas({ AUTH_SECRET: "auth" });
    expect(derivado).not.toBe("auth");
    expect(derivado.length).toBeGreaterThan(20);
    expect(secretoSesionDudas({})).toBe("");
  });
});

describe("freno de intentos", () => {
  it("bloquea al llegar al maximo y libera al pasar la ventana", () => {
    const f = crearFrenoIntentos({ maxFallos: 3, ventanaMs: 1000 });
    f.registrarFallo("ip", 0);
    f.registrarFallo("ip", 100);
    expect(f.bloqueadoPor("ip", 200)).toBe(0);
    f.registrarFallo("ip", 200);
    expect(f.bloqueadoPor("ip", 300)).toBe(700);
    expect(f.bloqueadoPor("ip", 1000)).toBe(0);
    expect(f.bloqueadoPor("otra", 300)).toBe(0);
  });

  it("tope global para ataques repartidos", () => {
    const f = crearFrenoIntentos({ maxFallos: 5, ventanaMs: 1000, maxFallosGlobal: 3 });
    f.registrarFallo("a", 0);
    f.registrarFallo("b", 0);
    f.registrarFallo("c", 0);
    expect(f.bloqueadoPor("d", 10)).toBeGreaterThan(0);
  });

  it("lee la IP detras del proxy", () => {
    expect(ipDelCliente(new Headers({ "x-forwarded-for": "5.5.5.5, 10.0.0.1" }))).toBe("5.5.5.5");
    expect(ipDelCliente(new Headers({ "x-real-ip": "6.6.6.6", "x-forwarded-for": "5.5.5.5" }))).toBe("6.6.6.6");
  });
});

const base: Duda = {
  id: "q1",
  codigo: null,
  grupo: "foto",
  titulo: "t",
  duda: "",
  orden: 1,
  datos: [["Foto", "https://lh3.googleusercontent.com/abc"], ["Otra", "ver https://x.com/a.jpg y https://x.com/doc"]],
  opciones: [{ id: "si", label: "Sí" }, { id: "no", label: "No", texto: "¿Dónde?" }],
  links: [{ label: "Drive", url: "https://drive.google.com/drive/folders/1" }],
  extra: { fotos: ["https://x.com/b.png"] },
  activa: true,
};

const resp = (dudaId: string, ms: number, opcionId = "si"): Respuesta => ({
  id: `${dudaId}-${ms}`,
  dudaId,
  opcionId,
  opcionTexto: "",
  texto: "",
  nota: "",
  autorNombre: "A",
  accesoId: null,
  createdAt: new Date(ms),
});

describe("duda", () => {
  it("encuentra fotos en datos y extra, no carpetas de Drive", () => {
    expect(fotosDeLaDuda(base)).toEqual(["https://lh3.googleusercontent.com/abc", "https://x.com/a.jpg", "https://x.com/b.png"]);
  });

  it("valida la respuesta", () => {
    expect(validarRespuesta(base, { opcionId: "si", texto: "x", nota: "" })).toMatchObject({ ok: true, texto: "" });
    expect(validarRespuesta(base, { opcionId: "no", texto: "", nota: "" }).ok).toBe(false);
    expect(validarRespuesta(base, { opcionId: "no", texto: " aqui ", nota: "" })).toMatchObject({ ok: true, texto: "aqui", opcionTexto: "No" });
  });

  it("la ultima respuesta es la vigente; filtra y cuenta por grupo", () => {
    const dudas = [base, { ...base, id: "q2", orden: 2 }, { ...base, id: "q3", grupo: "nombre" }, { ...base, id: "q4", activa: false }];
    const vigentes = respuestaVigentePorDuda([resp("q1", 2, "no"), resp("q1", 1), resp("q3", 5)]);
    expect(vigentes.get("q1")?.opcionId).toBe("no");
    const t = armarTablero(dudas, vigentes, "pendientes");
    expect(t).toMatchObject({ total: 3, pendientes: 1, respondidas: 2 });
    expect(t.grupos.map((g) => [g.grupo, g.pendientes, g.tarjetas.length])).toEqual([
      ["nombre", 0, 0],
      ["foto", 1, 1],
    ]);
  });

  it("CSV escapa comillas y formulas", () => {
    expect(filasCsv([["a,b", 'di "x"', "=1+1"]])).toBe('"a,b","di ""x""",\'=1+1');
  });
});

describe("importacion", () => {
  it("lee el id del archivo e ignora desktop.ini", () => {
    expect(idDesdeArchivo("q001.json")).toBe("q001");
    expect(idDesdeArchivo("desktop.ini")).toBeNull();
  });

  it("lee una pregunta exportada y guarda los campos de mas en extra", () => {
    const p = leerPreguntaExportada("q062", {
      codigo: "ACV013",
      grupo: "foto",
      titulo: "¿Estas fotos son de este producto?",
      duda: "",
      orden: 62,
      estado: "abierta",
      datos: [["Producto", "ACV013"]],
      links: [],
      opciones: [{ id: "si", label: "Sí" }, { id: "mezcla", label: "Mezcladas", texto: "¿Cuáles?" }],
      fotos: ["https://x.com/1.jpg"],
    });
    expect(p).toMatchObject({ id: "q062", codigo: "ACV013", orden: 62, extra: { fotos: ["https://x.com/1.jpg"] } });
    expect(p.opciones[1].texto).toBe("¿Cuáles?");
    expect(leerPreguntaExportada("q039", { grupo: "categoria", titulo: "t", opciones: [{ id: "ok", label: "ok" }] })).toMatchObject({
      codigo: null,
      extra: null,
      links: [],
    });
    expect(() => leerPreguntaExportada("q1", { grupo: "x", titulo: "t", opciones: [] })).toThrow();
  });

  it("lee una respuesta exportada con id fijo y autor de claude.ai", () => {
    const r = leerRespuestaExportada("q001", {
      codigo: "ACV009",
      fecha: "2026-10-21T17:12:28.374Z",
      nota: "",
      opcion: "ok",
      opcion_texto: "Sí, así está bien",
      por: "u_x",
      texto: "",
    });
    expect(r).toEqual({
      id: "import-q001",
      dudaId: "q001",
      opcionId: "ok",
      opcionTexto: "Sí, así está bien",
      texto: "",
      nota: "",
      autorNombre: "Magilus (claude.ai)",
      createdAt: new Date("2026-10-21T17:12:28.374Z"),
    });
  });
});
