// Freno contra fuerza bruta del codigo de /dudas: maximo N intentos fallidos por clave (IP) en una
// ventana de tiempo. Vive en memoria del proceso (la app corre con 1 replica); un reinicio lo limpia.
// Ademas hay un tope global de fallos (todas las IP juntas) para frenar un ataque repartido.

export type FrenoIntentos = {
  /** ms que faltan para poder intentar de nuevo (0 = puede intentar). */
  bloqueadoPor(clave: string, ahora?: number): number;
  registrarFallo(clave: string, ahora?: number): void;
  limpiar(clave: string): void;
};

export function crearFrenoIntentos(opciones: {
  maxFallos: number;
  ventanaMs: number;
  maxFallosGlobal?: number;
}): FrenoIntentos {
  const fallos = new Map<string, number[]>();
  let globales: number[] = [];

  const vigentes = (lista: number[], ahora: number) => lista.filter((t) => ahora - t < opciones.ventanaMs);

  return {
    bloqueadoPor(clave, ahora = Date.now()) {
      const propios = vigentes(fallos.get(clave) ?? [], ahora);
      if (propios.length) fallos.set(clave, propios);
      else fallos.delete(clave);
      globales = vigentes(globales, ahora);

      let espera = 0;
      if (propios.length >= opciones.maxFallos) {
        espera = Math.max(espera, propios[propios.length - opciones.maxFallos] + opciones.ventanaMs - ahora);
      }
      if (opciones.maxFallosGlobal && globales.length >= opciones.maxFallosGlobal) {
        espera = Math.max(espera, globales[globales.length - opciones.maxFallosGlobal] + opciones.ventanaMs - ahora);
      }
      return Math.max(0, espera);
    },
    registrarFallo(clave, ahora = Date.now()) {
      const propios = vigentes(fallos.get(clave) ?? [], ahora);
      propios.push(ahora);
      fallos.set(clave, propios);
      globales = vigentes(globales, ahora);
      globales.push(ahora);
      // No crecer sin limite si llegan muchas IP distintas.
      if (fallos.size > 5000) {
        for (const [k, lista] of fallos) {
          if (!vigentes(lista, ahora).length) fallos.delete(k);
        }
      }
    },
    limpiar(clave) {
      fallos.delete(clave);
    },
  };
}

export function minutosDeEspera(ms: number): number {
  return Math.max(1, Math.ceil(ms / 60_000));
}

// IP del cliente detras de Traefik: X-Real-IP o el primer valor de X-Forwarded-For.
export function ipDelCliente(headers: Headers): string {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  const reenviada = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return reenviada || "desconocida";
}
