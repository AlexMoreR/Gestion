// Funciones puras para generar la "foto" de la aplicacion (scripts/generate-app-snapshot.mjs).
// Sin dependencias: solo trabajan con texto. Probadas en app-snapshot-helpers.test.mjs.

// "src/app/(workspace)/admin/ordenes/[orderId]/page.tsx" -> "/admin/ordenes/[orderId]"
export function routeFromAppFile(relativePath) {
  const normalized = relativePath.replace(/\\/g, "/");
  const withoutPrefix = normalized.replace(/^src\/app\/?/, "");
  const segments = withoutPrefix.split("/");
  segments.pop(); // page.tsx / route.ts
  const visible = segments.filter((segment) => segment && !/^\(.*\)$/.test(segment));
  return `/${visible.join("/")}`;
}

export function extractExportedFunctions(source) {
  const names = [];
  const pattern = /export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    names.push(match[1]);
  }
  return names;
}

// Metodos HTTP exportados por un route handler (GET, POST, ...).
export function extractRouteMethods(source) {
  const methods = new Set();
  const pattern = /export\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    methods.add(match[1]);
  }
  // export const { GET, POST } = handlers;
  const destructured = /export\s+const\s*\{([^}]+)\}/g;
  while ((match = destructured.exec(source)) !== null) {
    for (const name of match[1].split(",").map((item) => item.trim().split(/\s*:\s*/).pop())) {
      if (/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(name)) methods.add(name);
    }
  }
  return [...methods];
}

function matchBlock(source, openIndex, open, close) {
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === open) depth += 1;
    else if (char === close) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

// Devuelve el codigo de una funcion (con los comentarios // justo encima), o null.
export function extractFunctionSource(source, functionName, maxLength = 6000) {
  const pattern = new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${functionName}\\s*[<(]`);
  const match = pattern.exec(source);
  if (!match) return null;

  const parenStart = source.indexOf("(", match.index);
  const parenEnd = matchBlock(source, parenStart, "(", ")");
  if (parenEnd < 0) return null;
  const braceStart = source.indexOf("{", parenEnd);
  const braceEnd = braceStart < 0 ? -1 : matchBlock(source, braceStart, "{", "}");
  if (braceEnd < 0) return null;

  // Comentarios // pegados encima de la funcion.
  const before = source.slice(0, match.index).split("\n");
  before.pop(); // fragmento de la linea donde empieza la funcion
  const comments = [];
  for (let index = before.length - 1; index >= 0; index -= 1) {
    const line = before[index].trim();
    if (!line.startsWith("//")) break;
    comments.unshift(before[index]);
  }

  const code = [...comments, source.slice(match.index, braceEnd + 1)].join("\n");
  return code.length > maxLength ? `${code.slice(0, maxLength)}\n// ... (recortado)` : code;
}

// --- Despliegue -------------------------------------------------------------

export function parseDockerfile(content) {
  const lines = content.split("\n").map((line) => line.trim());
  const pick = (instruction) =>
    lines.filter((line) => line.toUpperCase().startsWith(`${instruction} `)).map((line) => line.slice(instruction.length + 1).trim());
  return {
    imagenesBase: pick("FROM"),
    env: pick("ENV"),
    cmd: pick("CMD").at(-1) ?? null,
    entrypoint: pick("ENTRYPOINT").at(-1) ?? null,
    expose: pick("EXPOSE"),
  };
}

export function parseWorkflow(content) {
  const nameMatch = /^name:\s*(.+)$/m.exec(content);
  const branchesMatch = /push:\s*\n\s*branches:\s*\[([^\]]*)\]/m.exec(content);
  const steps = [...content.matchAll(/^\s*-\s*name:\s*(.+)$/gm)].map((match) => match[1].trim());
  const tags = [...content.matchAll(/^\s*tags:\s*(.+)$/gm)].map((match) => match[1].trim());
  return {
    nombre: nameMatch ? nameMatch[1].trim() : null,
    ramasQueDisparan: branchesMatch
      ? branchesMatch[1].split(",").map((branch) => branch.trim().replace(/["']/g, "")).filter(Boolean)
      : [],
    disparoManual: /workflow_dispatch/.test(content),
    pasos: steps,
    imagenes: tags,
    webhookPortainer: /portainer/i.test(content),
    correPruebas: /npm (run )?test|vitest/.test(content),
  };
}

// Lectura aproximada (sin dependencias) de un docker-compose: solo NOMBRES de
// variables, nunca sus valores.
export function parseCompose(content) {
  const lines = content.split("\n");
  const services = [];
  let inServices = false;
  let current = null;
  let inEnvironment = false;

  for (const rawLine of lines) {
    if (/^\S/.test(rawLine)) {
      inServices = rawLine.startsWith("services:");
      current = null;
      inEnvironment = false;
      continue;
    }
    if (!inServices) continue;

    const serviceMatch = /^ {2}([A-Za-z0-9_.-]+):\s*$/.exec(rawLine);
    if (serviceMatch) {
      current = { nombre: serviceMatch[1], imagen: null, variables: [], replicas: null, restricciones: [], dominios: [], volumenes: [] };
      services.push(current);
      inEnvironment = false;
      continue;
    }
    if (!current) continue;

    const line = rawLine.trim();
    if (/^ {4}\S/.test(rawLine)) {
      inEnvironment = line.startsWith("environment:");
    }
    const image = /^image:\s*(.+)$/.exec(line);
    if (image) current.imagen = image[1].trim();
    const envVar = /^ {6}([A-Z0-9_]+):/.exec(rawLine);
    if (inEnvironment && envVar) current.variables.push(envVar[1]);
    const replicas = /^replicas:\s*(\d+)/.exec(line);
    if (replicas) current.replicas = Number(replicas[1]);
    const constraint = /^-\s*(node\.[^\s].*)$/.exec(line);
    if (constraint) current.restricciones.push(constraint[1].trim());
    const host = /Host\(`([^`]+)`\)/g;
    let hostMatch;
    while ((hostMatch = host.exec(line)) !== null) current.dominios.push(hostMatch[1]);
    const volume = /^-\s*([A-Za-z0-9_]+):(\/\S+)/.exec(line);
    if (volume) current.volumenes.push(`${volume[1]} -> ${volume[2]}`);
  }

  return services.map((service) => ({ ...service, dominios: [...new Set(service.dominios)] }));
}

export function analyzeStartupScript(content) {
  return {
    usaSetE: /set\s+-[a-z]*e/.test(content),
    correMigraciones: /prisma\s+migrate\s+deploy/.test(content),
  };
}
