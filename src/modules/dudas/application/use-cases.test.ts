import { describe, expect, it } from "vitest";

import type { Duda, Respuesta } from "../domain/duda";
import { crearFrenoIntentos } from "../domain/freno-intentos";
import { crearTokenSesion } from "../domain/sesion";
import {
  cargarTablero,
  crearAcceso,
  entrarConCodigo,
  guardarRespuesta,
  sesionVigente,
  type AccesoGuardado,
  type DudasRepository,
  type LoginDeps,
} from "./use-cases";

const SECRETO = "secreto-de-prueba-para-dudas";
const AHORA = new Date("2026-10-26T15:00:00Z");

// "Hash" de prueba: el codigo al reves (bcrypt real es lento para pruebas).
const hashFalso = async (codigo: string) => `h:${codigo.split("").reverse().join("")}`;
const compararFalso = async (codigo: string, hash: string) => hash === (await hashFalso(codigo));

function duda(over: Partial<Duda> = {}): Duda {
  return {
    id: "q001",
    codigo: "ACV009",
    grupo: "nombre",
    titulo: "¿Así debe llamarse este producto?",
    duda: "",
    orden: 1,
    datos: [["Código", "ACV009"]],
    opciones: [
      { id: "ok", label: "Sí, así está bien" },
      { id: "cambiar", label: "No, se llama distinto", texto: "Escribe el nombre correcto" },
    ],
    links: [],
    extra: null,
    activa: true,
    ...over,
  };
}

async function repoFalso(): Promise<DudasRepository & { accesos: AccesoGuardado[]; respuestas: Respuesta[] }> {
  const accesos: AccesoGuardado[] = [
    { id: "a1", nombre: "Ingrid", codigoHash: await hashFalso("ABC234"), activo: true, createdAt: AHORA, ultimoUso: null },
    { id: "a2", nombre: "Vieja", codigoHash: await hashFalso("XYZ789"), activo: false, createdAt: AHORA, ultimoUso: null },
  ];
  const dudas = [duda(), duda({ id: "q002", orden: 2, titulo: "Otra" })];
  const respuestas: Respuesta[] = [];
  let n = 0;
  return {
    accesos,
    respuestas,
    listarDudas: async () => dudas,
    buscarDuda: async (id) => dudas.find((d) => d.id === id) ?? null,
    listarRespuestas: async () => respuestas,
    crearRespuesta: async (datos) => {
      const r = { ...datos, id: `r${++n}`, createdAt: new Date(AHORA.getTime() + n) };
      respuestas.push(r);
      return r;
    },
    listarAccesosActivos: async () => accesos.filter((a) => a.activo),
    buscarAcceso: async (id) => accesos.find((a) => a.id === id) ?? null,
    marcarUso: async (id, fecha) => {
      const a = accesos.find((x) => x.id === id);
      if (a) a.ultimoUso = fecha;
    },
    crearAcceso: async (datos) => {
      const a = { id: `a${accesos.length + 1}`, ...datos, activo: true, createdAt: AHORA, ultimoUso: null };
      accesos.push(a);
      return a;
    },
    desactivarAcceso: async (id) => {
      const a = accesos.find((x) => x.id === id);
      if (a) a.activo = false;
    },
    listarAccesos: async () => accesos,
  };
}

async function deps(over: Partial<LoginDeps> = {}) {
  const repo = await repoFalso();
  const d: LoginDeps = {
    repo,
    secreto: SECRETO,
    ahora: () => AHORA,
    freno: crearFrenoIntentos({ maxFallos: 5, ventanaMs: 15 * 60_000 }),
    compararCodigo: compararFalso,
    ...over,
  };
  return { d, repo };
}

describe("entrarConCodigo", () => {
  it("con el codigo correcto entra y devuelve una sesion firmada", async () => {
    const { d, repo } = await deps();
    const r = await entrarConCodigo(d, { nombre: "  Ingrid  ", codigo: "abc 234", ip: "1.1.1.1" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.nombre).toBe("Ingrid");
    expect(repo.accesos[0].ultimoUso).toEqual(AHORA);
    expect(await sesionVigente(d, r.token)).toEqual({ accesoId: "a1", nombre: "Ingrid" });
  });

  it("con un codigo incorrecto no entra y explica en español", async () => {
    const { d } = await deps();
    const r = await entrarConCodigo(d, { nombre: "Ingrid", codigo: "ABC235", ip: "1.1.1.1" });
    expect(r).toEqual({ ok: false, error: expect.stringContaining("Código incorrecto") });
  });

  it("un acceso desactivado no entra", async () => {
    const { d } = await deps();
    const r = await entrarConCodigo(d, { nombre: "Vieja", codigo: "XYZ789", ip: "1.1.1.1" });
    expect(r.ok).toBe(false);
  });

  it("pide el nombre", async () => {
    const { d } = await deps();
    const r = await entrarConCodigo(d, { nombre: " ", codigo: "ABC234", ip: "1.1.1.1" });
    expect(r).toEqual({ ok: false, error: "Escribe tu nombre." });
  });

  it("frena despues de 5 intentos fallidos por IP, aunque el sexto sea correcto", async () => {
    const { d } = await deps();
    for (let i = 0; i < 4; i += 1) {
      const r = await entrarConCodigo(d, { nombre: "Xa", codigo: "QQQQQQ", ip: "9.9.9.9" });
      expect(r).toEqual({ ok: false, error: expect.stringContaining("Código incorrecto") });
    }
    const quinto = await entrarConCodigo(d, { nombre: "Xa", codigo: "QQQQQQ", ip: "9.9.9.9" });
    expect(quinto).toEqual({ ok: false, error: expect.stringContaining("espera 15 min") });

    const sexto = await entrarConCodigo(d, { nombre: "Ingrid", codigo: "ABC234", ip: "9.9.9.9" });
    expect(sexto).toEqual({ ok: false, error: expect.stringContaining("Demasiados intentos") });

    // Otra IP sigue entrando.
    const otra = await entrarConCodigo(d, { nombre: "Ingrid", codigo: "ABC234", ip: "8.8.8.8" });
    expect(otra.ok).toBe(true);
  });

  it("pasados 15 minutos se puede intentar de nuevo", async () => {
    let ahora = AHORA;
    const { d } = await deps({ ahora: () => ahora });
    for (let i = 0; i < 5; i += 1) await entrarConCodigo(d, { nombre: "Xa", codigo: "QQQQQQ", ip: "9.9.9.9" });
    ahora = new Date(AHORA.getTime() + 15 * 60_000 + 1);
    const r = await entrarConCodigo(d, { nombre: "Ingrid", codigo: "ABC234", ip: "9.9.9.9" });
    expect(r.ok).toBe(true);
  });

  it("un codigo mal formado cuenta como intento fallido", async () => {
    const { d } = await deps();
    for (let i = 0; i < 5; i += 1) await entrarConCodigo(d, { nombre: "Xa", codigo: "0O1l", ip: "7.7.7.7" });
    const r = await entrarConCodigo(d, { nombre: "Ingrid", codigo: "ABC234", ip: "7.7.7.7" });
    expect(r).toEqual({ ok: false, error: expect.stringContaining("Demasiados intentos") });
  });

  it("sin secreto configurado no deja entrar", async () => {
    const { d } = await deps({ secreto: "" });
    const r = await entrarConCodigo(d, { nombre: "Ingrid", codigo: "ABC234", ip: "1.1.1.1" });
    expect(r.ok).toBe(false);
  });
});

describe("solo con sesion se ven y se responden las preguntas", () => {
  it("sin cookie no devuelve preguntas", async () => {
    const { d } = await deps();
    expect(await cargarTablero(d, undefined, "todas")).toEqual({ ok: false });
    expect(await cargarTablero(d, "", "todas")).toEqual({ ok: false });
  });

  it("con una cookie alterada o firmada con otro secreto no devuelve preguntas", async () => {
    const { d } = await deps();
    const buena = crearTokenSesion({ accesoId: "a1", nombre: "Ingrid" }, SECRETO, AHORA.getTime())!;
    const [payload] = buena.split(".");
    const otra = Buffer.from(JSON.stringify({ a: "a1", n: "Hacker", e: AHORA.getTime() + 1e9 })).toString("base64url");
    expect(await cargarTablero(d, `${otra}.${buena.split(".")[1]}`, "todas")).toEqual({ ok: false });
    expect(await cargarTablero(d, `${payload}.firmafalsa`, "todas")).toEqual({ ok: false });
    const ajena = crearTokenSesion({ accesoId: "a1", nombre: "Ingrid" }, "otro-secreto", AHORA.getTime())!;
    expect(await cargarTablero(d, ajena, "todas")).toEqual({ ok: false });
  });

  it("con la sesion de un acceso desactivado no devuelve preguntas", async () => {
    const { d, repo } = await deps();
    const token = crearTokenSesion({ accesoId: "a1", nombre: "Ingrid" }, SECRETO, AHORA.getTime())!;
    expect((await cargarTablero(d, token, "todas")).ok).toBe(true);
    await repo.desactivarAcceso("a1");
    expect(await cargarTablero(d, token, "todas")).toEqual({ ok: false });
  });

  it("una sesion vencida (30 dias) no sirve", async () => {
    const { d } = await deps();
    const token = crearTokenSesion({ accesoId: "a1", nombre: "Ingrid" }, SECRETO, AHORA.getTime() - 31 * 24 * 3600_000)!;
    expect(await cargarTablero(d, token, "todas")).toEqual({ ok: false });
  });

  it("con sesion valida trae las preguntas agrupadas", async () => {
    const { d } = await deps();
    const token = crearTokenSesion({ accesoId: "a1", nombre: "Ingrid" }, SECRETO, AHORA.getTime())!;
    const r = await cargarTablero(d, token, "pendientes");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tablero.pendientes).toBe(2);
    expect(r.tablero.grupos[0].tarjetas.map((t) => t.id)).toEqual(["q001", "q002"]);
  });

  it("guardar sin sesion no escribe nada", async () => {
    const { d, repo } = await deps();
    const r = await guardarRespuesta(d, undefined, { dudaId: "q001", opcionId: "ok", texto: "", nota: "" });
    expect(r).toMatchObject({ ok: false, sinSesion: true });
    expect(repo.respuestas).toHaveLength(0);
  });
});

describe("guardarRespuesta", () => {
  it("guarda con el nombre de la sesion y la ultima es la vigente", async () => {
    const { d, repo } = await deps();
    const token = crearTokenSesion({ accesoId: "a1", nombre: "Ingrid" }, SECRETO, AHORA.getTime())!;
    const r1 = await guardarRespuesta(d, token, { dudaId: "q001", opcionId: "ok", texto: "ignorado", nota: "" });
    expect(r1).toMatchObject({ ok: true, respuesta: { autorNombre: "Ingrid", accesoId: "a1", opcionTexto: "Sí, así está bien", texto: "" } });
    const r2 = await guardarRespuesta(d, token, { dudaId: "q001", opcionId: "cambiar", texto: "Carrito 3 puestos", nota: "ojo" });
    expect(r2.ok).toBe(true);
    expect(repo.respuestas).toHaveLength(2);

    const tablero = await cargarTablero(d, token, "respondidas");
    if (!tablero.ok) throw new Error("sin sesion");
    expect(tablero.tablero.grupos[0].tarjetas[0].vigente?.texto).toBe("Carrito 3 puestos");
  });

  it("exige el detalle cuando la opcion lo pide y rechaza opciones inventadas", async () => {
    const { d } = await deps();
    const token = crearTokenSesion({ accesoId: "a1", nombre: "Ingrid" }, SECRETO, AHORA.getTime())!;
    expect(await guardarRespuesta(d, token, { dudaId: "q001", opcionId: "cambiar", texto: "  ", nota: "" })).toMatchObject({ ok: false });
    expect(await guardarRespuesta(d, token, { dudaId: "q001", opcionId: "inventada", texto: "", nota: "" })).toMatchObject({ ok: false });
    expect(await guardarRespuesta(d, token, { dudaId: "q999", opcionId: "ok", texto: "", nota: "" })).toMatchObject({ ok: false });
  });
});

describe("crearAcceso", () => {
  it("genera un codigo, guarda solo el hash y devuelve el codigo una vez", async () => {
    const repo = await repoFalso();
    const r = await crearAcceso(repo, hashFalso, " María ", () => "KMN456");
    expect(r).toMatchObject({ ok: true, codigo: "KMN456" });
    const guardado = repo.accesos.at(-1)!;
    expect(guardado.nombre).toBe("María");
    expect(guardado.codigoHash).not.toContain("KMN456");
  });
});
