// Aviso de la OF del combo a la proveedora por WhatsApp (nov-2026, combo camilla parte 3). Gestión no
// manda WhatsApp: le hace POST al CRM, que lo envía desde la línea Admin con la foto del color exacto.
// Se llama con dispararRecibo justo después de crear la OF: nunca rompe la venta ni el abono.
// Interruptor AppSetting "avisoOFConfig": apagado (no manda ni marca), prueba (por defecto: todo al
// número del dueño) o proveedoras. Candado: la OF se marca ENVIANDO solo si no tenía estado, así la misma
// OF nunca sale dos veces. shortcut: si el servidor se cae entre ENVIANDO y el resultado, la OF queda en
// ENVIANDO y no se reintenta (mejor no mandarla que mandarla dos veces); se ve en la bitácora.
import { displayCode } from "../../../lib/code-display";
import type { AvisoOFPlan } from "../domain/combo-camillas";
import { textoAvisoOF } from "../domain/combo-camillas";
import {
  AVISO_OF_CRM_URL_POR_DEFECTO,
  type AvisoOFConfig,
  type AvisoOFEstado,
  telefonoParaCrm,
} from "../domain/aviso-of-proveedora";
import { postJsonAlCrm, type EnvioDeps } from "./enviar-recibo-caja";

export type AvisoOFDatos = {
  ofCode: string;
  orderCode: string;
  plan: AvisoOFPlan;
  telefonoProveedora: string | null;
  mensaje: string; // mensajeOFProveedora, el mismo en prueba y con la proveedora
  imagenUrl: string | null; // dirección completa de la foto exacta del color
};

export type AvisoOFPuertos = {
  leerConfig: () => Promise<AvisoOFConfig>;
  cargar: (ofId: string) => Promise<AvisoOFDatos | null>; // null = la OF no es del combo o no existe
  tomar: (ofId: string) => Promise<boolean>; // ENVIANDO solo si avisoProveedoraEstado IS NULL
  marcar: (ofId: string, estado: AvisoOFEstado, en: Date, destino: string | null) => Promise<void>;
  bitacora: (entrada: { ofId: string; ofCode: string; estado: AvisoOFEstado; destino: string | null; en: Date; detalle: string }) => Promise<void>;
};

export function avisoOFUrl(env: Record<string, string | undefined> = process.env): string {
  return env.CRM_OF_WHATSAPP_URL?.trim() || AVISO_OF_CRM_URL_POR_DEFECTO;
}

/** Manda (o no) la OF y deja el resultado. null = no se hizo nada (apagado, sin combo, de bodega o ya tomada). */
export async function enviarOFProveedora(
  ofId: string,
  puertos: AvisoOFPuertos,
  deps: EnvioDeps = {},
): Promise<AvisoOFEstado | null> {
  let datos: AvisoOFDatos | null;
  let config: AvisoOFConfig;
  try {
    config = await puertos.leerConfig();
    if (config.modo === "apagado") return null;
    datos = await puertos.cargar(ofId);
    if (!datos || datos.plan.accion === "nada") return null;
    if (!(await puertos.tomar(ofId))) return null;
  } catch (error) {
    console.error(`Aviso de la OF ${ofId}: no se pudo preparar.`, error);
    return null;
  }

  const of = displayCode(datos.ofCode);
  const url = avisoOFUrl(deps.env ?? process.env);
  let estado: AvisoOFEstado = "FALLIDO";
  let destino: string | null = null;
  let detalle = "";
  try {
    if (datos.plan.accion === "alerta") {
      // Falta algo: la OF no sale; al dueño le llega el aviso para mandarla a mano.
      destino = config.numeroPrueba;
      const texto = `${of} (${displayCode(datos.orderCode)}) no se le mandó sola a la proveedora. ${textoAvisoOF(datos.plan)}`;
      const ok = await postJsonAlCrm(url, { linea: "Admin", telefono: destino, texto, imagenUrl: null }, `Aviso de la ${of}`, deps);
      estado = "ALERTA";
      detalle = ok ? "aviso al dueño enviado" : "el CRM no recibió el aviso al dueño";
    } else {
      destino = config.modo === "prueba" ? config.numeroPrueba : telefonoParaCrm(datos.telefonoProveedora);
      if (!destino) {
        detalle = "el teléfono de la proveedora no sirve";
      } else {
        const cuerpo = { linea: "Admin", telefono: destino, texto: datos.mensaje, imagenUrl: datos.imagenUrl };
        const ok = await postJsonAlCrm(url, cuerpo, `Aviso de la ${of}`, deps);
        estado = ok ? (config.modo === "prueba" ? "PRUEBA" : "ENVIADO") : "FALLIDO";
        detalle = ok ? (config.modo === "prueba" ? "modo prueba: salió al número del dueño" : "enviada a la proveedora") : "el CRM no respondió";
      }
    }
  } catch (error) {
    console.error(`Aviso de la ${of}: falló.`, error);
    detalle = "error al mandar";
  }

  const en = new Date();
  await puertos.marcar(ofId, estado, en, destino).catch((error) => console.error(`Aviso de la ${of}: no se pudo marcar.`, error));
  await puertos
    .bitacora({ ofId, ofCode: datos.ofCode, estado, destino, en, detalle })
    .catch((error) => console.error(`Aviso de la ${of}: no se pudo anotar.`, error));
  return estado;
}
