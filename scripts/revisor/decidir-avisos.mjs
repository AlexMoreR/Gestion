// Revisor diario: decide a quién avisar comparando los hallazgos de hoy con los de ayer.
// Un hallazgo es el mismo si tiene el mismo tipo y código.
//  - Nuevo (no estaba ayer): avisa a Sistemas.
//  - De plata que ya estaba ayer (sigue sin arreglar): avisa a Sistemas y también al dueño.
//  - Sin plata que ya estaba ayer: ya se avisó, no se repite.
// Sin archivo de ayer, todo es nuevo.
//
// Uso desde revisor-diario.sh:
//   node decidir-avisos.mjs texto <sistemas|dueno> hoy.json [ayer.json]  → texto del correo (vacío = no avisar)
//   node decidir-avisos.mjs saldos ayer.json                             → JSON de `saldos` de esa corrida
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const MAX_LINEAS = 200;

const clave = (h) => `${h.tipo}|${h.codigo}`;

export function decidirAvisos(hoy, ayer) {
  const deAyer = new Set((ayer ?? []).map(clave));
  const sistemas = [];
  const dueno = [];
  for (const h of hoy) {
    const yaEstaba = deAyer.has(clave(h));
    if (!yaEstaba) sistemas.push(h);
    else if (h.esPlata) {
      sistemas.push(h);
      dueno.push(h);
    }
  }
  return { sistemas, dueno };
}

export function textoDelAviso(lista, para, fecha, ayer) {
  if (lista.length === 0) return "";
  const deAyer = new Set((ayer ?? []).map(clave));
  const linea = (h) => `- ${h.esPlata ? "[PLATA] " : ""}${h.tipo} ${h.codigo}: ${h.detalle}`;
  const partes = [];
  if (para === "dueno") {
    partes.push(`Revisor de Gestión (${fecha}): estos casos con plata siguen sin arreglar desde ayer.`, "Sistemas ya está avisado.", "");
    partes.push(...lista.slice(0, MAX_LINEAS).map(linea));
  } else {
    const nuevos = lista.filter((h) => !deAyer.has(clave(h)));
    const siguen = lista.filter((h) => deAyer.has(clave(h)));
    partes.push(`Revisor de Gestión (${fecha}). Solo lectura: no se cambió nada.`, "");
    if (nuevos.length) partes.push(`Nuevos (${nuevos.length}):`, ...nuevos.slice(0, MAX_LINEAS).map(linea), "");
    if (siguen.length) partes.push(`Con plata y siguen desde ayer (${siguen.length}, también se avisó al dueño):`, ...siguen.slice(0, MAX_LINEAS).map(linea), "");
  }
  if (lista.length > MAX_LINEAS) partes.push(`(La lista se cortó; el detalle completo está en el JSON del día.)`);
  return partes.join("\n").trimEnd();
}

function leer(ruta) {
  return JSON.parse(readFileSync(ruta, "utf8"));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [comando, ...args] = process.argv.slice(2);
  if (comando === "saldos") {
    const saldos = leer(args[0]).saldos;
    process.stdout.write(JSON.stringify(saldos && typeof saldos === "object" ? saldos : {}));
  } else if (comando === "texto" && (args[0] === "sistemas" || args[0] === "dueno") && args[1]) {
    const hoy = leer(args[1]);
    if (!Array.isArray(hoy.hallazgos)) throw new Error("El JSON de hoy no trae hallazgos");
    const ayer = args[2] ? leer(args[2]).hallazgos ?? [] : null;
    const avisos = decidirAvisos(hoy.hallazgos, ayer);
    process.stdout.write(textoDelAviso(avisos[args[0]], args[0], hoy.fecha ?? "", ayer));
  } else {
    console.error("Uso: decidir-avisos.mjs texto <sistemas|dueno> hoy.json [ayer.json] | saldos ayer.json");
    process.exit(2);
  }
}
