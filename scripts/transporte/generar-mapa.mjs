#!/usr/bin/env node
// Genera src/modules/transporte/data/colombia-mapa.json: formas SVG de los municipios (MGN del DANE)
// y la posición de los centros poblados (DIVIPOLA del DANE). Node puro, sin librerías y sin base.
//
// Uso:
//   node scripts/transporte/generar-mapa.mjs                      # baja los datos a una carpeta temporal
//   node scripts/transporte/generar-mapa.mjs --municipios=<mgn.geojson> --centros=<divipola.csv>
//   node scripts/transporte/generar-mapa.mjs --carpeta=<dir>      # carpeta donde se bajan (fuera del repo)
//
// Fuentes, en orden: primero el DANE; si la red lo bloquea, una copia pública de los mismos datos.
// Si ninguna responde, se para y pide el archivo: nunca se inventan formas.
import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DIVIPOLA = join(RAIZ, "src/modules/transporte/data/colombia-divipola.json");
const SALIDA = join(RAIZ, "src/modules/transporte/data/colombia-mapa.json");
const TOPE_BYTES = 1.5 * 1024 * 1024;

const FUENTES = {
  // MGN de municipios (GeoJSON, WGS84). Campo del código de 5 dígitos: MPIO_CCNCT (o MPIO_CDPMP).
  municipios: [
    // DANE (servicio del geoportal; puede cambiar de dirección).
    "https://geoportal.dane.gov.co/mparcgis/rest/services/Divipola/Serv_DIVIPOLA_MGN_2018/MapServer/1/query?where=1%3D1&outFields=MPIO_CCNCT&outSR=4326&f=geojson",
    // Copia pública en GitHub del MGN 2018 del DANE (repo john-guerra/geoColombia, MIT).
    "https://raw.githubusercontent.com/john-guerra/geoColombia/main/data/municipalities.geo.json",
  ],
  // DIVIPOLA de centros poblados (CSV con ';': COD_CPOB, TIPO, LONGTIUD/LONGITUD, LATITUD).
  centros: [
    "https://geoportal.dane.gov.co/descargas/divipola/DIVIPOLA_CentrosPoblados.csv",
    // Copia pública en GitLab de la DIVIPOLA del DANE de enero de 2025 (pasosdeJesus/division-politica).
    "https://gitlab.com/pasosdeJesus/division-politica/-/raw/main/Colombia/2025/DIVIPOLA_DANE_CentrosPoblados-2025-01-25.csv",
  ],
};

function argumento(nombre) {
  const a = process.argv.find((x) => x.startsWith(`--${nombre}=`));
  return a ? a.slice(nombre.length + 3) : null;
}

async function bajar(tipo, carpeta, valida) {
  const destino = join(carpeta, `${tipo}.descarga`);
  for (const url of FUENTES[tipo]) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(120_000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const texto = await r.text();
      valida(texto);
      writeFileSync(destino, texto);
      console.log(`✓ ${tipo}: ${url}`);
      return destino;
    } catch (e) {
      console.log(`✗ ${tipo}: ${url} (${e.message})`);
    }
  }
  console.error(`\nNo se pudo bajar "${tipo}" de ninguna fuente. Consigue el archivo y pásalo con --${tipo}=<ruta>.`);
  process.exit(1);
}

const validaGeojson = (t) => {
  const j = JSON.parse(t);
  if (!Array.isArray(j.features) || j.features.length < 1000) throw new Error("no parece el MGN de municipios");
};
const validaCsv = (t) => {
  if (!/COD_CPOB/.test(t.slice(0, 500))) throw new Error("no parece la DIVIPOLA de centros poblados");
};

// --- Geometría ---------------------------------------------------------------------------------

// Douglas-Peucker sobre [x, y] ya proyectados.
export function simplificar(puntos, tolerancia) {
  if (puntos.length < 3) return puntos;
  const t2 = tolerancia * tolerancia;
  const marca = new Uint8Array(puntos.length);
  marca[0] = marca[puntos.length - 1] = 1;
  const pila = [[0, puntos.length - 1]];
  while (pila.length) {
    const [a, b] = pila.pop();
    const [ax, ay] = puntos[a];
    const [bx, by] = puntos[b];
    const dx = bx - ax;
    const dy = by - ay;
    const largo2 = dx * dx + dy * dy;
    let maximo = -1;
    let indice = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = puntos[i];
      let d2;
      if (largo2 === 0) d2 = (px - ax) ** 2 + (py - ay) ** 2;
      else {
        const u = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / largo2));
        d2 = (px - ax - u * dx) ** 2 + (py - ay - u * dy) ** 2;
      }
      if (d2 > maximo) [maximo, indice] = [d2, i];
    }
    if (maximo > t2) {
      marca[indice] = 1;
      pila.push([a, indice], [indice, b]);
    }
  }
  return puntos.filter((_, i) => marca[i]);
}

export const r1 = (n) => Math.round(n * 10) / 10;
export const num = (n) => String(r1(n)).replace(/^(-?)0\./, "$1.");

export function anillos(geometria) {
  if (!geometria) return [];
  if (geometria.type === "Polygon") return geometria.coordinates;
  if (geometria.type === "MultiPolygon") return geometria.coordinates.flat();
  return [];
}

// Proyección equirectangular sencilla: x = (lon − lon0)·cos(lat0)·escala, y = (latMax − lat)·escala.
export function proyeccion(limites, escala) {
  const [lonMin, latMin, lonMax, latMax] = limites;
  const k = Math.cos((((latMin + latMax) / 2) * Math.PI) / 180);
  return {
    p: ([lon, lat]) => [(lon - lonMin) * k * escala, (latMax - lat) * escala],
    viewBox: `0 0 ${num((lonMax - lonMin) * k * escala)} ${num((latMax - latMin) * escala)}`,
  };
}

export function limitesDe(features) {
  let l = [Infinity, Infinity, -Infinity, -Infinity];
  for (const f of features)
    for (const anillo of anillos(f.geometry))
      for (const [x, y] of anillo) l = [Math.min(l[0], x), Math.min(l[1], y), Math.max(l[2], x), Math.max(l[3], y)];
  return l;
}

// Path SVG relativo ("M x y l dx dy … z"), con deltas sobre los valores ya redondeados para no acumular error.
function pathDe(geometria, p, tolerancia) {
  const partes = [];
  const lista = anillos(geometria).map((a) => a.map(p));
  // El anillo más grande siempre queda, aunque la simplificación lo deje muy chico.
  const mayor = lista.reduce((m, a, i) => (a.length > lista[m].length ? i : m), 0);
  lista.forEach((anillo, i) => {
    let pts = simplificar(anillo, tolerancia).map(([x, y]) => [r1(x), r1(y)]);
    pts = pts.filter((q, j) => j === 0 || q[0] !== pts[j - 1][0] || q[1] !== pts[j - 1][1]);
    if (pts.length > 1 && pts[0][0] === pts.at(-1)[0] && pts[0][1] === pts.at(-1)[1]) pts.pop();
    if (pts.length < 3 && i !== mayor) return;
    let s = `M${num(pts[0][0])} ${num(pts[0][1])}`;
    if (pts.length > 1) s += "l" + pts.slice(1).map((q, j) => `${num(q[0] - pts[j][0])} ${num(q[1] - pts[j][1])}`).join(" ");
    partes.push(s + "z");
  });
  return partes.join("").replace(/ -/g, "-");
}

// --- Principal ----------------------------------------------------------------------------------

async function principal() {
  const carpeta = argumento("carpeta") ?? join(tmpdir(), "gestion-mapa-colombia");
  mkdirSync(carpeta, { recursive: true });
  const rutaMun = argumento("municipios") ?? (await bajar("municipios", carpeta, validaGeojson));
  const rutaCp = argumento("centros") ?? (await bajar("centros", carpeta, validaCsv));
  for (const r of [rutaMun, rutaCp]) if (!existsSync(r)) throw new Error(`No existe ${r}`);

  const divipola = JSON.parse(readFileSync(DIVIPOLA, "utf8"));
  const ciudades = new Set(divipola.cities.map((c) => c.code));
  const mgn = JSON.parse(readFileSync(rutaMun, "utf8"));
  const codigoDe = (f) => String(f.properties.MPIO_CCNCT ?? f.properties.MPIO_CDPMP ?? f.properties.MPIOS ?? "");
  const conForma = mgn.features.filter((f) => ciudades.has(codigoDe(f)) && anillos(f.geometry).length);
  const islas = conForma.filter((f) => codigoDe(f).startsWith("88"));
  const continente = conForma.filter((f) => !codigoDe(f).startsWith("88"));

  // CSV de centros poblados: separador ';' y el DANE escribe "LONGTIUD" (sic) en algunas versiones.
  const [cabecera, ...filas] = readFileSync(rutaCp, "utf8").replace(/^﻿/, "").split(/\r?\n/).filter(Boolean);
  const cols = cabecera.split(";");
  const iCod = cols.indexOf("COD_CPOB");
  const iLon = cols.findIndex((c) => /^LONG/.test(c));
  const iLat = cols.indexOf("LATITUD");
  if (iCod < 0 || iLon < 0 || iLat < 0) throw new Error(`Columnas inesperadas en ${rutaCp}: ${cabecera}`);
  const coord = new Map();
  for (const f of filas) {
    const c = f.split(";");
    const lon = Number(c[iLon].replace(",", "."));
    const lat = Number(c[iLat].replace(",", "."));
    if (Number.isFinite(lon) && Number.isFinite(lat) && lon !== 0) coord.set(c[iCod], [lon, lat]);
  }

  const cont = proyeccion(limitesDe(continente), 50);
  const isla = proyeccion(limitesDe(islas), 800);
  const centros = {};
  const centrosIslas = {};
  for (const l of divipola.localities) {
    const c = coord.get(l.code);
    if (!c) continue;
    if (l.city.startsWith("88")) centrosIslas[l.code] = isla.p(c).map(r1);
    else centros[l.code] = cont.p(c).map(r1);
  }

  let salida = "";
  for (const tolerancia of [0.2, 0.3, 0.4, 0.5, 0.7, 1, 1.5, 2]) {
    const mapa = {
      viewBox: cont.viewBox,
      municipios: Object.fromEntries(continente.map((f) => [codigoDe(f), pathDe(f.geometry, cont.p, tolerancia)])),
      centrosPoblados: centros,
      recuadroSanAndres: {
        viewBox: isla.viewBox,
        municipios: Object.fromEntries(islas.map((f) => [codigoDe(f), pathDe(f.geometry, isla.p, tolerancia / 4)])),
        centrosPoblados: centrosIslas,
      },
    };
    salida = JSON.stringify(mapa);
    console.log(`tolerancia ${tolerancia}: ${(salida.length / 1024).toFixed(0)} KB`);
    if (Buffer.byteLength(salida) < TOPE_BYTES) break;
  }
  if (Buffer.byteLength(salida) >= TOPE_BYTES) throw new Error("No baja de 1,5 MB ni con la tolerancia más alta");

  writeFileSync(SALIDA, salida + "\n");
  const sinForma = divipola.cities.filter((c) => !conForma.some((f) => codigoDe(f) === c.code));
  const sinCoord = divipola.localities.filter((l) => !coord.has(l.code));
  console.log(`\nEscrito ${SALIDA} (${(statSync(SALIDA).size / 1024).toFixed(0)} KB)`);
  console.log(`Municipios con forma: ${conForma.length}/${divipola.cities.length}`);
  if (sinForma.length) console.log(`Sin forma en el MGN: ${sinForma.map((c) => `${c.code} ${c.name}`).join(", ")}`);
  const sobran = mgn.features.map(codigoDe).filter((c) => !ciudades.has(c));
  if (sobran.length) console.log(`Formas del MGN sin municipio en DIVIPOLA (no se usan): ${sobran.join(", ")}`);
  console.log(`Centros poblados con coordenada: ${divipola.localities.length - sinCoord.length}/${divipola.localities.length}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  principal().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
