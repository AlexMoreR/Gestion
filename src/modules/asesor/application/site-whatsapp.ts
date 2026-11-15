// Cambiar el WhatsApp de la página por el MCP, en dos pasos (resumen → "sí" → guardar).
// Imports relativos (Vitest no resuelve el alias "@/").
import { normalizeWhatsAppPhone } from "../../../lib/whatsapp-phone";
import { AsesorInputError } from "../domain/calculations";

export type SiteWhatsAppDeps = {
  /** Número que usa hoy la página (el de getSystemWhatsAppPhoneDisplay). */
  current(): Promise<string>;
  /** Guarda el número (setSystemWhatsAppPhone). */
  save(phone: string): Promise<void>;
  /** Refresca la tienda y los enlaces que muestran el número. */
  refresh(): void;
  /** Anota en la bitácora (ActivityLog, origin MCP). */
  log(summary: string): Promise<void>;
};

export type SiteWhatsAppChange = { guardado: boolean; antes: string; nuevo: string; resumen: string };

export async function changeSiteWhatsApp(
  deps: SiteWhatsAppDeps,
  numero: string,
  confirmado: boolean,
): Promise<SiteWhatsAppChange> {
  // Misma validación que setSystemWhatsAppPhone: inválido → error y no se guarda nada.
  const nuevo = normalizeWhatsAppPhone(numero);
  if (!nuevo) {
    throw new AsesorInputError(
      "Numero de WhatsApp invalido: solo digitos, espacios, +, ( ) y guiones, con 7 a 15 digitos (ej. +57 316 983 1667). No se guardo nada.",
    );
  }
  const antes = await deps.current();
  if (!confirmado) {
    return { guardado: false, antes, nuevo, resumen: `Cambiar el WhatsApp de la pagina de ${antes} a ${nuevo}.` };
  }
  await deps.save(nuevo);
  deps.refresh();
  const resumen = `Cambió el WhatsApp de la página de ${antes} a ${nuevo} (por Claude)`;
  await deps.log(resumen);
  return { guardado: true, antes, nuevo, resumen };
}
