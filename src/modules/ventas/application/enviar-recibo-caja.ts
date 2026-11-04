// Envío del recibo de caja al CRM (nov-2026). Se llama dentro de after() de Next: corre después
// de responderle a la asesora, así la pantalla no espera. El CRM reenvía el PDF por WhatsApp al
// cliente (hoy está en modo PRUEBA y solo le llega al dueño). Nunca lanza: un fallo queda como
// "FALLIDO" en el abono. shortcut: no hay reintento programado; si el CRM está caído ~40 s el
// recibo queda "no enviado" (si hace falta, un botón "Reenviar recibo" en otra tarjeta).
import {
  RECIBO_CRM_URL_POR_DEFECTO,
  armarReciboCaja,
  nombreArchivoRecibo,
  type ReciboCajaDatos,
  type ReciboCajaEstado,
  type ReciboVenta,
} from "../domain/recibo-caja";
import { generarReciboCajaPdf } from "../infrastructure/recibo-caja-pdf";
import { after } from "next/server";

export type ReciboCajaCuerpo = ReciboCajaDatos & { pdfBase64: string; nombreArchivo: string };

export type EnvioDeps = {
  fetch?: typeof fetch;
  env?: Record<string, string | undefined>;
  esperar?: (ms: number) => Promise<void>;
};

export const ESPERAS_REINTENTO_MS = [2_000, 8_000, 30_000];

export function reciboCajaApagado(env: Record<string, string | undefined> = process.env): boolean {
  return env.RECIBO_CAJA_AVISO?.trim().toLowerCase() === "off";
}

export function reciboCajaUrl(env: Record<string, string | undefined> = process.env): string {
  return env.CRM_RECIBO_URL?.trim() || RECIBO_CRM_URL_POR_DEFECTO;
}

// La misma llave de la conexión CRM↔Gestión, en el mismo orden que src/app/api/cotizaciones/route.ts.
export function reciboCajaLlave(env: Record<string, string | undefined> = process.env): string | null {
  return env.CRM_API_KEY?.trim() || env.CATALOGO_API_KEY?.trim() || env.MCP_API_KEY?.trim() || null;
}

export async function armarCuerpoRecibo(datos: ReciboCajaDatos): Promise<ReciboCajaCuerpo> {
  const pdf = await generarReciboCajaPdf(datos);
  return { ...datos, pdfBase64: Buffer.from(pdf).toString("base64"), nombreArchivo: nombreArchivoRecibo(datos) };
}

/** Manda el cuerpo al CRM: 1 intento + reintentos a los 2, 8 y 30 s. True si el CRM respondió 2xx. */
export async function postReciboAlCrm(cuerpo: ReciboCajaCuerpo, deps: EnvioDeps = {}): Promise<boolean> {
  const env = deps.env ?? process.env;
  const llave = reciboCajaLlave(env);
  if (!llave) {
    console.error("Recibo de caja: falta la llave CRM_API_KEY (o CATALOGO_API_KEY / MCP_API_KEY).");
    return false;
  }
  const doFetch = deps.fetch ?? fetch;
  const esperar = deps.esperar ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const url = reciboCajaUrl(env);
  const body = JSON.stringify(cuerpo);
  for (let intento = 0; intento <= ESPERAS_REINTENTO_MS.length; intento++) {
    if (intento > 0) await esperar(ESPERAS_REINTENTO_MS[intento - 1]);
    try {
      const res = await doFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${llave}` },
        body,
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) return true;
      console.error(`Recibo de caja ${cuerpo.ventaCodigo}: el CRM respondió ${res.status} (intento ${intento + 1}).`);
    } catch (error) {
      console.error(`Recibo de caja ${cuerpo.ventaCodigo}: no se pudo llegar al CRM (intento ${intento + 1}).`, error instanceof Error ? error.message : error);
    }
  }
  return false;
}

export type ReciboCajaPuertos = {
  cargarVenta: (saleId: string) => Promise<ReciboVenta | null>;
  marcar: (abonoIds: string[], estado: ReciboCajaEstado, en: Date) => Promise<void>;
};

/**
 * Arma y manda un recibo por los abonos indicados de la venta y deja el estado en esos abonos.
 * Con RECIBO_CAJA_AVISO=off no hace nada (ni marca).
 */
export async function enviarReciboCaja(
  saleId: string,
  abonoIds: string[],
  puertos: ReciboCajaPuertos,
  deps: EnvioDeps = {},
): Promise<ReciboCajaEstado | null> {
  if (reciboCajaApagado(deps.env ?? process.env) || abonoIds.length === 0) return null;
  try {
    const venta = await puertos.cargarVenta(saleId);
    const datos = venta ? armarReciboCaja(venta, abonoIds) : null;
    if (!datos) return null;
    const ok = await postReciboAlCrm(await armarCuerpoRecibo(datos), deps);
    const estado: ReciboCajaEstado = ok ? "ENVIADO" : "FALLIDO";
    await puertos.marcar(abonoIds, estado, new Date());
    return estado;
  } catch (error) {
    console.error(`Recibo de caja de la venta ${saleId}: falló.`, error);
    await puertos.marcar(abonoIds, "FALLIDO", new Date()).catch(() => undefined);
    return "FALLIDO";
  }
}

/**
 * Programa el envío del recibo sin poder romper la venta ni el abono: dentro de una petición usa
 * after() de Next; fuera de una (pruebas, scripts) after() lanza error y se manda igual en segundo plano.
 */
export function dispararRecibo(tarea: () => Promise<unknown>, programar: (t: () => Promise<unknown>) => void = after): void {
  const enSegundoPlano = () => {
    try {
      void tarea().catch((error) => console.error("Recibo de caja: falló en segundo plano.", error));
    } catch (error) {
      console.error("Recibo de caja: no se pudo arrancar.", error);
    }
  };
  try {
    programar(tarea);
  } catch {
    enSegundoPlano();
  }
}
