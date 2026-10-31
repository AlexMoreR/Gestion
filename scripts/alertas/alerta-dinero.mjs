#!/usr/bin/env node
// Aviso diario de dinero (corre en aizen1 por cron, fuera de la imagen; ver README.md).
// 1) Pide el texto a Gestion: GET $GESTION_URL/api/alertas/dinero con la llave ALERTAS_API_KEY.
// 2) Solo si avisar=true, lo manda por WhatsApp (WAHA, sesion de la linea Admin) a ALERTA_TELEFONO.
// Con --simular muestra el texto y NO llama a WAHA. Si algo falla, lo escribe en el registro
// (stderr) y sale con codigo 1, sin reintentar: asi nunca llega el mismo mensaje dos veces.

const simular = process.argv.includes("--simular");

function requerida(nombre) {
  const valor = process.env[nombre]?.trim();
  if (!valor) throw new Error(`falta la variable ${nombre}`);
  return valor;
}

function hora() {
  return new Date().toISOString();
}

async function pedirAviso() {
  const base = requerida("GESTION_URL").replace(/\/+$/, "");
  const respuesta = await fetch(`${base}/api/alertas/dinero`, {
    headers: { Authorization: `Bearer ${requerida("ALERTAS_API_KEY")}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!respuesta.ok) throw new Error(`Gestion respondio ${respuesta.status}`);
  const cuerpo = await respuesta.json();
  if (typeof cuerpo?.avisar !== "boolean" || typeof cuerpo?.mensaje !== "string") {
    throw new Error("Gestion respondio algo que no es { avisar, mensaje }");
  }
  return cuerpo;
}

async function mandarWhatsApp(texto) {
  const base = requerida("WAHA_URL").replace(/\/+$/, "");
  const telefono = requerida("ALERTA_TELEFONO").replace(/\D/g, "");
  const respuesta = await fetch(`${base}/api/sendText`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Api-Key": requerida("WAHA_API_KEY") },
    body: JSON.stringify({ session: requerida("WAHA_SESSION"), chatId: `${telefono}@c.us`, text: texto }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!respuesta.ok) throw new Error(`WAHA respondio ${respuesta.status}`);
}

try {
  const { avisar, mensaje } = await pedirAviso();
  if (!avisar) {
    console.log(`${hora()} todo bien, no se manda nada`);
  } else if (simular) {
    console.log(`${hora()} [simulacion] se mandaria:\n${mensaje}`);
  } else {
    await mandarWhatsApp(mensaje);
    console.log(`${hora()} aviso mandado`);
  }
} catch (error) {
  console.error(`${hora()} ERROR alerta de dinero: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
}
