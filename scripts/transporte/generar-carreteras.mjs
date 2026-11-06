#!/usr/bin/env node
// Genera src/modules/transporte/data/colombia-carreteras.json: las carreteras del mapa de Transporte,
// como paths SVG en la MISMA proyección de colombia-mapa.json. Node puro, sin librerías y sin base.
//
// Uso:
//   node scripts/transporte/generar-carreteras.mjs                  # baja los datos a una carpeta temporal
//   node scripts/transporte/generar-carreteras.mjs --vias=<osm.json> --municipios=<mgn.geojson>
//
// Fuente de las vías: OpenStreetMap (Overpass). Licencia ODbL: el mapa debe mostrar
// "© OpenStreetMap" donde se vean. Clases: motorway y trunk = principales, primary = secundarias,
// secondary = terciarias.
import { mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { anillos, limitesDe, num, proyeccion, r1, simplificar } from "./generar-mapa.mjs";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const MAPA = join(RAIZ, "src/modules/transporte/data/colombia-mapa.json");
const SALIDA = join(RAIZ, "src/modules/transporte/data/colombia-carreteras.json");
const TOPE_BYTES = 500 * 1024;
const OVERPASS = "https://overpass-api.de/api/interpreter";
const MGN = "https://raw.githubusercontent.com/john-guerra/geoColombia/main/data/municipalities.geo.json";
const CONSULTA = `[out:json][timeout:500];
area["ISO3166-1"="CO"][admin_level=2]->.co;
way["highway"~"^(motorway|trunk|primary|secondary)$"](area.co);
out tags geom;`;
const NIVEL = { motorway: "principales", trunk: "principales", primary: "secundarias", secondary: "terciarias" };
const NIVELES = ["principales", "secundarias", "terciarias"];
// Una vía a menos de esto (grados, ~2 km) del borde dibujado se conserva: las formas están simplificadas.
const HOLGURA = 0.02;

function argumento(nombre) {
  const a = process.argv.find((x) => x.startsWith(`--${nombre}=`));
  return a ? a.slice(nombre.length + 3) : null;
}

async function bajarVias(carpeta) {
  const r = await fetch(OVERPASS, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "gestion-mapa-transporte/1.0" },
    body: new URLSearchParams({ data: CONSULTA }),
    signal: AbortSignal.timeout(590_000),
  });
  if (!r.ok) throw new Error(`Overpass respondió HTTP ${r.status}. Pasa el archivo con --vias=<ruta>.`);
  const destino = join(carpeta, "vias.json");
  writeFileSync(destino, await r.text());
  return destino;
}

async function bajarMgn(carpeta) {
  const r = await fetch(MGN, { signal: AbortSignal.timeout(120_000) });
  if (!r.ok) throw new Error(`MGN respondió HTTP ${r.status}. Pasa el archivo con --municipios=<ruta>.`);
  const destino = join(carpeta, "municipios.geojson");
  writeFileSync(destino, await r.text());
  return destino;
}

// ¿El punto cae dentro de Colombia? Par-impar por municipio, con una rejilla para no recorrerlos todos.
function detectorDePais(features) {
  const CELDA = 0.25;
  const rejilla = new Map();
  for (const f of features) {
    const rings = anillos(f.geometry);
    const [x0, y0, x1, y1] = limitesDe([f]);
    for (let x = Math.floor(x0 / CELDA); x <= Math.floor(x1 / CELDA); x++)
      for (let y = Math.floor(y0 / CELDA); y <= Math.floor(y1 / CELDA); y++) {
        const k = `${x},${y}`;
        if (!rejilla.has(k)) rejilla.set(k, []);
        rejilla.get(k).push(rings);
      }
  }
  const dentro = (lon, lat) =>
    (rejilla.get(`${Math.floor(lon / CELDA)},${Math.floor(lat / CELDA)}`) ?? []).some((rings) => {
      let adentro = false;
      for (const anillo of rings)
        for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
          const [xi, yi] = anillo[i];
          const [xj, yj] = anillo[j];
          if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) adentro = !adentro;
        }
      return adentro;
    });
  return (lon, lat) =>
    dentro(lon, lat) ||
    dentro(lon + HOLGURA, lat) ||
    dentro(lon - HOLGURA, lat) ||
    dentro(lon, lat + HOLGURA) ||
    dentro(lon, lat - HOLGURA);
}

// Une líneas que comparten un extremo, solo donde no hay cruce (exactamente dos líneas en ese punto).
function unirLineas(lineas) {
  const key = ([x, y]) => `${x},${y}`;
  const porExtremo = new Map();
  lineas.forEach((l, i) => {
    for (const p of [l[0], l.at(-1)]) {
      const k = key(p);
      if (!porExtremo.has(k)) porExtremo.set(k, []);
      porExtremo.get(k).push(i);
    }
  });
  const usada = new Uint8Array(lineas.length);
  const siguiente = (punto) => {
    const candidatas = porExtremo.get(key(punto));
    if (candidatas.length !== 2) return -1;
    const i = candidatas.find((c) => !usada[c]);
    return i === undefined ? -1 : i;
  };
  const salida = [];
  for (let i = 0; i < lineas.length; i++) {
    if (usada[i]) continue;
    usada[i] = 1;
    const delante = [...lineas[i]];
    const detras = [];
    for (let punta = delante.at(-1), j = siguiente(punta); j >= 0; j = siguiente(punta)) {
      usada[j] = 1;
      const l = key(lineas[j][0]) === key(punta) ? lineas[j] : [...lineas[j]].reverse();
      for (let k = 1; k < l.length; k++) delante.push(l[k]);
      punta = delante.at(-1);
    }
    for (let punta = delante[0], j = siguiente(punta); j >= 0; j = siguiente(punta)) {
      usada[j] = 1;
      const l = key(lineas[j].at(-1)) === key(punta) ? lineas[j] : [...lineas[j]].reverse();
      for (let k = l.length - 2; k >= 0; k--) detras.push(l[k]);
      punta = detras.at(-1);
    }
    salida.push([...detras.reverse(), ...delante]);
  }
  return salida;
}

// Quita tramos repetidos (doble calzada que al redondear cae en la misma línea, o ya dibujados en una
// clase mayor) y parte la línea donde había uno.
function sinRepetidos(lineas, vistos) {
  const salida = [];
  for (const linea of lineas) {
    let tramo = [linea[0]];
    for (let i = 1; i < linea.length; i++) {
      const [a, b] = [linea[i - 1], linea[i]];
      const [ka, kb] = [`${a[0]},${a[1]}`, `${b[0]},${b[1]}`];
      const k = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      if (vistos.has(k)) {
        if (tramo.length > 1) salida.push(tramo);
        tramo = [b];
      } else {
        vistos.add(k);
        tramo.push(b);
      }
    }
    if (tramo.length > 1) salida.push(tramo);
  }
  return salida;
}

function pathDe(lineas) {
  return lineas
    .map(
      (pts) =>
        `M${num(pts[0][0])} ${num(pts[0][1])}l${pts
          .slice(1)
          .map((q, j) => `${num(q[0] - pts[j][0])} ${num(q[1] - pts[j][1])}`)
          .join(" ")}`,
    )
    .join("")
    .replace(/ -/g, "-");
}

// Líneas [lon, lat] -> proyectadas, simplificadas y redondeadas, sin puntos repetidos.
function preparar(lineas, p, tolerancia) {
  return unirLineas(lineas)
    .map((l) => {
      const pts = simplificar(l.map(p), tolerancia).map(([x, y]) => [r1(x), r1(y)]);
      return pts.filter((q, j) => j === 0 || q[0] !== pts[j - 1][0] || q[1] !== pts[j - 1][1]);
    })
    .filter((l) => l.length > 1);
}

async function principal() {
  const carpeta = join(tmpdir(), "gestion-mapa-colombia");
  mkdirSync(carpeta, { recursive: true });
  const rutaVias = argumento("vias") ?? (await bajarVias(carpeta));
  const rutaMgn = argumento("municipios") ?? (await bajarMgn(carpeta));

  const mgn = JSON.parse(readFileSync(rutaMgn, "utf8"));
  const codigoDe = (f) => String(f.properties.MPIO_CCNCT ?? f.properties.MPIO_CDPMP ?? f.properties.MPIOS ?? "");
  const conForma = mgn.features.filter((f) => anillos(f.geometry).length);
  const islas = conForma.filter((f) => codigoDe(f).startsWith("88"));
  const continente = conForma.filter((f) => !codigoDe(f).startsWith("88"));
  const cont = proyeccion(limitesDe(continente), 50);
  const isla = proyeccion(limitesDe(islas), 800);

  // Si esto no coincide, las carreteras quedarían corridas respecto a los municipios.
  const mapa = JSON.parse(readFileSync(MAPA, "utf8"));
  if (cont.viewBox !== mapa.viewBox) throw new Error(`Proyección distinta: ${cont.viewBox} vs ${mapa.viewBox}`);
  if (isla.viewBox !== mapa.recuadroSanAndres.viewBox) {
    throw new Error(`Proyección del recuadro distinta: ${isla.viewBox} vs ${mapa.recuadroSanAndres.viewBox}`);
  }

  const enColombia = detectorDePais(conForma);
  const osm = JSON.parse(readFileSync(rutaVias, "utf8"));
  const porNivel = { principales: [], secundarias: [], terciarias: [] };
  const deIslas = [];
  let descartados = 0;
  for (const via of osm.elements) {
    const nivel = NIVEL[via.tags?.highway];
    if (!nivel || !via.geometry?.length) continue;
    // Una vía puede salir del país (Cúcuta-San Antonio): se parte donde cruza y se queda lo de adentro.
    let tramo = [];
    const cerrar = () => {
      if (tramo.length > 1) (tramo[0][0] < -80 ? deIslas : porNivel[nivel]).push(tramo);
      tramo = [];
    };
    for (const { lon, lat } of via.geometry) {
      if (enColombia(lon, lat)) tramo.push([lon, lat]);
      else {
        descartados += 1;
        cerrar();
      }
    }
    cerrar();
  }
  console.log(`Puntos fuera de Colombia descartados: ${descartados}`);

  let salida = "";
  for (const tolerancia of [0.1, 0.15, 0.2, 0.3, 0.4, 0.5]) {
    const vistos = new Set();
    const carreteras = {};
    for (const nivel of NIVELES) {
      const lineas = sinRepetidos(preparar(porNivel[nivel], cont.p, tolerancia), vistos);
      carreteras[nivel] = pathDe(unirLineas(lineas));
    }
    const viasIsla = pathDe(sinRepetidos(preparar(deIslas, isla.p, tolerancia), new Set()));
    salida = JSON.stringify({
      fuente: "© OpenStreetMap (ODbL)",
      fecha: osm.osm3s?.timestamp_osm_base?.slice(0, 10) ?? null,
      viewBox: cont.viewBox,
      ...carreteras,
      recuadroSanAndres: { viewBox: isla.viewBox, vias: viasIsla },
    });
    const pesos = NIVELES.map((n) => `${n} ${(carreteras[n].length / 1024).toFixed(0)}`).join(", ");
    console.log(
      `tolerancia ${tolerancia}: ${(salida.length / 1024).toFixed(0)} KB (${pesos}; islas ${(viasIsla.length / 1024).toFixed(1)})`,
    );
    if (Buffer.byteLength(salida) < TOPE_BYTES) break;
  }
  if (Buffer.byteLength(salida) >= TOPE_BYTES) throw new Error("No baja del tope ni con la tolerancia más alta");

  writeFileSync(SALIDA, salida + "\n");
  console.log(`Escrito ${SALIDA} (${(statSync(SALIDA).size / 1024).toFixed(0)} KB)`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  principal().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
