import { esCodigoBienFormado, generarCodigoAcceso, limpiarNombre, normalizarCodigo } from "../domain/codigo";
import {
  armarTablero,
  respuestaVigentePorDuda,
  validarRespuesta,
  type Duda,
  type FiltroDudas,
  type Respuesta,
} from "../domain/duda";
import { minutosDeEspera, type FrenoIntentos } from "../domain/freno-intentos";
import { crearTokenSesion, leerTokenSesion } from "../domain/sesion";

// Casos de uso de "Dudas del catalogo". Todo lo que muestra o guarda preguntas pasa por una sesion
// valida (cookie firmada + acceso todavia activo).

export type AccesoGuardado = { id: string; nombre: string; codigoHash: string; activo: boolean; createdAt: Date; ultimoUso: Date | null };

export type DudasRepository = {
  listarDudas(): Promise<Duda[]>;
  buscarDuda(id: string): Promise<Duda | null>;
  listarRespuestas(): Promise<Respuesta[]>;
  crearRespuesta(datos: Omit<Respuesta, "id" | "createdAt">): Promise<Respuesta>;
  listarAccesosActivos(): Promise<AccesoGuardado[]>;
  buscarAcceso(id: string): Promise<AccesoGuardado | null>;
  marcarUso(id: string, fecha: Date): Promise<void>;
  crearAcceso(datos: { nombre: string; codigoHash: string }): Promise<AccesoGuardado>;
  desactivarAcceso(id: string): Promise<void>;
  listarAccesos(): Promise<AccesoGuardado[]>;
};

export type DudasDeps = {
  repo: DudasRepository;
  secreto: string;
  ahora?: () => Date;
};

export type LoginDeps = DudasDeps & {
  freno: FrenoIntentos;
  compararCodigo: (codigo: string, hash: string) => Promise<boolean>;
};

const ahoraDe = (deps: DudasDeps) => deps.ahora?.() ?? new Date();

export type ResultadoLogin = { ok: true; token: string; nombre: string } | { ok: false; error: string };

export async function entrarConCodigo(
  deps: LoginDeps,
  entrada: { nombre: string; codigo: string; ip: string },
): Promise<ResultadoLogin> {
  const ahora = ahoraDe(deps);
  if (!deps.secreto) {
    return { ok: false, error: "El acceso todavía no está configurado. Avísale a Emanuel." };
  }
  const espera = deps.freno.bloqueadoPor(entrada.ip, ahora.getTime());
  if (espera > 0) {
    return {
      ok: false,
      error: `Demasiados intentos con un código incorrecto. Espera ${minutosDeEspera(espera)} min y vuelve a intentar.`,
    };
  }

  const nombre = limpiarNombre(entrada.nombre);
  if (nombre.length < 2) return { ok: false, error: "Escribe tu nombre." };
  const codigo = normalizarCodigo(entrada.codigo);
  if (!codigo) return { ok: false, error: "Escribe el código que te dio Emanuel." };

  let acceso: AccesoGuardado | null = null;
  if (esCodigoBienFormado(codigo)) {
    for (const candidato of await deps.repo.listarAccesosActivos()) {
      if (await deps.compararCodigo(codigo, candidato.codigoHash)) {
        acceso = candidato;
        break;
      }
    }
  }

  if (!acceso) {
    deps.freno.registrarFallo(entrada.ip, ahora.getTime());
    const quedan = deps.freno.bloqueadoPor(entrada.ip, ahora.getTime());
    return {
      ok: false,
      error: quedan > 0
        ? `Código incorrecto. Hiciste demasiados intentos: espera ${minutosDeEspera(quedan)} min.`
        : "Código incorrecto. Revísalo (son 6 letras y números) o pídele uno nuevo a Emanuel.",
    };
  }

  deps.freno.limpiar(entrada.ip);
  await deps.repo.marcarUso(acceso.id, ahora);
  const token = crearTokenSesion({ accesoId: acceso.id, nombre }, deps.secreto, ahora.getTime());
  if (!token) return { ok: false, error: "El acceso todavía no está configurado. Avísale a Emanuel." };
  return { ok: true, token, nombre };
}

export type SesionActiva = { accesoId: string; nombre: string };

export async function sesionVigente(deps: DudasDeps, token: string | null | undefined): Promise<SesionActiva | null> {
  const sesion = leerTokenSesion(token, deps.secreto, ahoraDe(deps).getTime());
  if (!sesion) return null;
  const acceso = await deps.repo.buscarAcceso(sesion.accesoId);
  if (!acceso || !acceso.activo) return null;
  return { accesoId: acceso.id, nombre: sesion.nombre };
}

export async function cargarTablero(deps: DudasDeps, token: string | null | undefined, filtro: FiltroDudas) {
  const sesion = await sesionVigente(deps, token);
  if (!sesion) return { ok: false as const };
  const [dudas, respuestas] = await Promise.all([deps.repo.listarDudas(), deps.repo.listarRespuestas()]);
  return { ok: true as const, sesion, tablero: armarTablero(dudas, respuestaVigentePorDuda(respuestas), filtro) };
}

export type ResultadoGuardar =
  | { ok: true; respuesta: Respuesta }
  | { ok: false; error: string; sinSesion?: boolean };

export async function guardarRespuesta(
  deps: DudasDeps,
  token: string | null | undefined,
  entrada: { dudaId: string; opcionId: string; texto: string; nota: string },
): Promise<ResultadoGuardar> {
  const sesion = await sesionVigente(deps, token);
  if (!sesion) return { ok: false, sinSesion: true, error: "Tu sesión se cerró. Vuelve a entrar con tu nombre y código." };
  const duda = await deps.repo.buscarDuda(entrada.dudaId);
  if (!duda || !duda.activa) return { ok: false, error: "Esta pregunta ya no está disponible." };
  const validada = validarRespuesta(duda, entrada);
  if (!validada.ok) return { ok: false, error: validada.error };
  const respuesta = await deps.repo.crearRespuesta({
    dudaId: duda.id,
    opcionId: validada.opcionId,
    opcionTexto: validada.opcionTexto,
    texto: validada.texto,
    nota: validada.nota,
    autorNombre: sesion.nombre,
    accesoId: sesion.accesoId,
  });
  await deps.repo.marcarUso(sesion.accesoId, ahoraDe(deps));
  return { ok: true, respuesta };
}

// --- Admin ---

export async function crearAcceso(
  repo: DudasRepository,
  hashear: (codigo: string) => Promise<string>,
  nombreEntrada: string,
  generar: () => string = generarCodigoAcceso,
): Promise<{ ok: true; codigo: string; acceso: AccesoGuardado } | { ok: false; error: string }> {
  const nombre = limpiarNombre(nombreEntrada);
  if (nombre.length < 2) return { ok: false, error: "Escribe el nombre de la persona." };
  const codigo = generar();
  const acceso = await repo.crearAcceso({ nombre, codigoHash: await hashear(codigo) });
  return { ok: true, codigo, acceso };
}
