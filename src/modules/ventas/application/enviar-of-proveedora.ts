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

// ── Parte 4: el cambio de una OF que ya le salió a la proveedora (nov-2026) ──
// Un AvisoColorOF nuevo («Cambiar color», «Cancelar producto», «Cambiar producto», «Pasar a stock») sale
// en un mensaje APARTE solo si la OF ya se mandó (ENVIADO, o PRUEBA si salió al número del dueño): solo
// el cambio, nunca la OF completa. Mismo interruptor; si la OF solo salió en prueba, el cambio también va
// al número de prueba (la proveedora nunca la recibió). Candado por aviso: whatsappEstado NULL → ENVIANDO.
// shortcut: igual que la OF, un aviso trabado en ENVIANDO no se reintenta.
const OF_YA_ENVIADA = new Set(["ENVIADO", "PRUEBA"]);

export type AvisoCambioDatos = {
  ofCode: string;
  estadoOF: string | null; // ManufacturingOrder.avisoProveedoraEstado
  telefonoProveedora: string | null;
  mensaje: string; // mensajeAvisoOF: el cambio y el enlace de la OF
  esCambioDeColor: boolean;
  imagenUrl: string | null; // foto exacta del color nuevo (solo en un cambio de color del combo)
};

export type AvisoCambioPuertos = {
  leerConfig: () => Promise<AvisoOFConfig>;
  cargar: (avisoId: string) => Promise<AvisoCambioDatos | null>;
  tomar: (avisoId: string) => Promise<boolean>; // ENVIANDO solo si whatsappEstado IS NULL
  marcar: (avisoId: string, estado: AvisoOFEstado, en: Date) => Promise<void>;
  bitacora: (entrada: { avisoId: string; ofCode: string; estado: AvisoOFEstado; destino: string | null; en: Date; detalle: string }) => Promise<void>;
};

/** Manda (o no) el cambio. null = no se hizo nada (apagado, OF no enviada, aviso inexistente o ya tomado). */
export async function avisarCambioOFSiYaSeEnvio(
  avisoId: string,
  puertos: AvisoCambioPuertos,
  deps: EnvioDeps = {},
): Promise<AvisoOFEstado | null> {
  let datos: AvisoCambioDatos | null;
  let config: AvisoOFConfig;
  try {
    config = await puertos.leerConfig();
    if (config.modo === "apagado") return null;
    datos = await puertos.cargar(avisoId);
    if (!datos || !OF_YA_ENVIADA.has(datos.estadoOF ?? "")) return null;
    if (!(await puertos.tomar(avisoId))) return null;
  } catch (error) {
    console.error(`Cambio de la OF (aviso ${avisoId}): no se pudo preparar.`, error);
    return null;
  }

  const of = displayCode(datos.ofCode);
  const url = avisoOFUrl(deps.env ?? process.env);
  const soloPrueba = config.modo === "prueba" || datos.estadoOF === "PRUEBA";
  const destino = soloPrueba ? config.numeroPrueba : telefonoParaCrm(datos.telefonoProveedora);
  const imagenUrl = datos.esCambioDeColor ? datos.imagenUrl : null;
  let estado: AvisoOFEstado = "FALLIDO";
  const detalles: string[] = [];
  try {
    if (!destino) {
      detalles.push("el teléfono de la proveedora no sirve");
    } else {
      const cuerpo = { linea: "Admin", telefono: destino, texto: datos.mensaje, imagenUrl };
      const ok = await postJsonAlCrm(url, cuerpo, `Cambio de la ${of}`, deps);
      estado = ok ? (soloPrueba ? "PRUEBA" : "ENVIADO") : "FALLIDO";
      detalles.push(ok ? (soloPrueba ? "modo prueba: salió al número del dueño" : "enviado a la proveedora") : "el CRM no respondió");
    }
    if (datos.esCambioDeColor && !imagenUrl) {
      // Sin foto del color nuevo: sale solo el texto y al dueño le llega la alerta.
      const texto = `El cambio de color de la ${of} salió sin foto. ${datos.mensaje}`;
      const ok = await postJsonAlCrm(url, { linea: "Admin", telefono: config.numeroPrueba, texto, imagenUrl: null }, `Alerta del cambio de la ${of}`, deps);
      detalles.push(ok ? "sin foto: alerta al dueño enviada" : "sin foto: el CRM no recibió la alerta al dueño");
    }
  } catch (error) {
    console.error(`Cambio de la ${of}: falló.`, error);
    detalles.push("error al mandar");
  }

  const en = new Date();
  await puertos.marcar(avisoId, estado, en).catch((error) => console.error(`Cambio de la ${of}: no se pudo marcar.`, error));
  await puertos
    .bitacora({ avisoId, ofCode: datos.ofCode, estado, destino, en, detalle: detalles.join(" · ") })
    .catch((error) => console.error(`Cambio de la ${of}: no se pudo anotar.`, error));
  return estado;
}
