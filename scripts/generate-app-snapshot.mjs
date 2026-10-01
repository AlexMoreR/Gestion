// Genera .next/gestion-snapshot.json: una "foto" de la aplicacion leida del repo en
// cada build (rutas, modulos, casos de uso, reglas en codigo, despliegue y el
// documento editable docs/asesor/gestion.md). La usa la herramienta MCP
// "que_es_esta_aplicacion", porque el codigo fuente no viaja dentro del
// contenedor de produccion.
//
// Se ejecuta solo en "postbuild" (npm run build). NUNCA hace fallar el build:
// cualquier error queda anotado en "avisos".

import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  analyzeStartupScript,
  extractExportedFunctions,
  extractFunctionSource,
  extractRouteMethods,
  parseCompose,
  parseDockerfile,
  parseWorkflow,
  routeFromAppFile,
} from "./app-snapshot-helpers.mjs";

const ROOT = process.cwd();
const OUTPUT = path.join(ROOT, ".next", "gestion-snapshot.json");
const DOC_FILE = "docs/asesor/gestion.md";

// Reglas de negocio cuyo CODIGO se copia tal cual en la foto. Si una funcion se
// renombra o se mueve, aparece un aviso para actualizar este listado.
const CODE_RULES = [
  { regla: "Costo unitario de cada producto vendido", archivo: "src/lib/order-item-cost.ts", funcion: "computeItemUnitCost" },
  { regla: "Ganancia por venta (ventas - producto - flete)", archivo: "src/modules/balances/domain/calculations.ts", funcion: "calculateSaleProfitSummary" },
  { regla: "Que ventas cuentan (pagadas y entregadas)", archivo: "src/modules/balances/infrastructure/prisma-balances-repository.ts", funcion: "buildProfitWhere" },
  { regla: "Mes en que se reconoce una venta (fecha de entrega)", archivo: "src/modules/balances/infrastructure/prisma-balances-repository.ts", funcion: "filterByDeliveryPeriod" },
  { regla: "Margen de catalogo a partir del precio", archivo: "src/lib/pricing.ts", funcion: "calculateMarginPctFromPrice" },
  { regla: "Precio de venta a partir del margen", archivo: "src/lib/pricing.ts", funcion: "calculateRetailPrice" },
  { regla: "Combos: se muestran como un solo producto", archivo: "src/lib/quote-display-items.ts", funcion: "groupQuoteDisplayItems" },
  { regla: "Comisiones por vendedora", archivo: "src/modules/asesor/domain/calculations.ts", funcion: "computeCommissions" },
];

const warnings = [];

async function readText(relativePath) {
  try {
    return await readFile(path.join(ROOT, relativePath), "utf8");
  } catch {
    return null;
  }
}

async function walk(relativeDir) {
  const results = [];
  let entries = [];
  try {
    entries = await readdir(path.join(ROOT, relativeDir), { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const relativePath = `${relativeDir}/${entry.name}`;
    if (entry.isDirectory()) results.push(...(await walk(relativePath)));
    else results.push(relativePath);
  }
  return results;
}

async function collectRoutes() {
  const files = (await walk("src/app")).filter((file) => /\/(page\.tsx|route\.ts)$/.test(file));
  const routes = [];
  for (const file of files) {
    const isApi = file.endsWith("route.ts");
    const source = isApi ? await readText(file) : null;
    routes.push({
      ruta: routeFromAppFile(file),
      tipo: isApi ? "api" : "pagina",
      archivo: file,
      ...(isApi ? { metodos: source ? extractRouteMethods(source) : [] } : {}),
    });
  }
  return routes.sort((left, right) => left.ruta.localeCompare(right.ruta));
}

async function collectModules() {
  let entries = [];
  try {
    entries = await readdir(path.join(ROOT, "src/modules"), { withFileTypes: true });
  } catch {
    warnings.push("No se encontro src/modules.");
    return [];
  }
  const modules = [];
  for (const entry of entries.filter((item) => item.isDirectory())) {
    const base = `src/modules/${entry.name}`;
    const layers = [];
    for (const layer of ["domain", "application", "infrastructure", "presentation"]) {
      if (existsSync(path.join(ROOT, base, layer))) layers.push(layer);
    }
    const useCasesSource = await readText(`${base}/application/use-cases.ts`);
    modules.push({
      nombre: entry.name,
      capas: layers,
      casosDeUso: useCasesSource ? extractExportedFunctions(useCasesSource) : [],
    });
  }
  return modules;
}

async function collectServerActions() {
  const files = (await walk("src/app/actions")).filter((file) => file.endsWith(".ts"));
  const actions = [];
  for (const file of files) {
    const source = await readText(file);
    if (!source) continue;
    actions.push({ archivo: file, acciones: extractExportedFunctions(source) });
  }
  return actions;
}

async function collectCodeRules() {
  const rules = [];
  for (const rule of CODE_RULES) {
    const source = await readText(rule.archivo);
    const code = source ? extractFunctionSource(source, rule.funcion) : null;
    if (!code) warnings.push(`No se encontro ${rule.funcion} en ${rule.archivo}: actualiza CODE_RULES.`);
    rules.push({ ...rule, encontrada: Boolean(code), codigo: code });
  }
  return rules;
}

async function collectDeploy() {
  const dockerfile = await readText("Dockerfile");

  const startupFiles = (await walk("docker")).concat(
    (await walk("scripts")).filter((file) => /entrypoint|start/i.test(file)),
  );
  const scripts = [];
  for (const file of startupFiles.filter((item) => item.endsWith(".sh"))) {
    const content = await readText(file);
    if (content) scripts.push({ archivo: file, contenido: content, ...analyzeStartupScript(content) });
  }

  const workflows = [];
  for (const file of (await walk(".github/workflows")).filter((item) => /\.ya?ml$/.test(item))) {
    const content = await readText(file);
    if (content) workflows.push({ archivo: file, ...parseWorkflow(content) });
  }

  const composeFiles = [];
  for (const name of ["docker-compose.yml", "docker-compose.yaml", "docker-compose.portainer.yml"]) {
    const content = await readText(name);
    if (content) composeFiles.push({ archivo: name, servicios: parseCompose(content) });
  }

  return {
    dockerfile: dockerfile ? { contenido: dockerfile, ...parseDockerfile(dockerfile) } : null,
    scriptsDeArranque: scripts,
    tieneDockerignore: existsSync(path.join(ROOT, ".dockerignore")),
    workflows,
    compose: composeFiles,
  };
}

async function readGitCommit() {
  try {
    const head = (await readText(".git/HEAD"))?.trim();
    if (!head) return { rama: null, commit: null };
    if (!head.startsWith("ref:")) return { rama: null, commit: head };
    const ref = head.replace("ref:", "").trim();
    const loose = (await readText(`.git/${ref}`))?.trim();
    if (loose) return { rama: ref.replace("refs/heads/", ""), commit: loose };
    const packed = await readText(".git/packed-refs");
    const line = packed?.split("\n").find((item) => item.endsWith(` ${ref}`));
    return { rama: ref.replace("refs/heads/", ""), commit: line ? line.split(" ")[0] : null };
  } catch {
    return { rama: null, commit: null };
  }
}

async function main() {
  const [rutas, modulos, accionesDeServidor, reglasEnCodigo, despliegue, git, documento] = await Promise.all([
    collectRoutes(),
    collectModules(),
    collectServerActions(),
    collectCodeRules(),
    collectDeploy(),
    readGitCommit(),
    readText(DOC_FILE),
  ]);

  if (!documento) warnings.push(`No se encontro ${DOC_FILE}.`);

  const snapshot = {
    version: 1,
    generadoEn: new Date().toISOString(),
    commit: process.env.GITHUB_SHA || git.commit,
    rama: git.rama,
    rutas,
    modulos,
    accionesDeServidor,
    reglasEnCodigo,
    despliegue,
    documento: documento ? { archivo: DOC_FILE, contenido: documento } : null,
    avisos: warnings,
  };

  await mkdir(path.dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, JSON.stringify(snapshot, null, 2), "utf8");
  console.log(
    `[snapshot] ${OUTPUT}: ${rutas.length} rutas, ${modulos.length} modulos, ${reglasEnCodigo.length} reglas, ${warnings.length} avisos.`,
  );
}

main().catch((error) => {
  // Nunca romper el build por la foto.
  console.warn("[snapshot] No se pudo generar la foto de la aplicacion:", error);
});
