// Radiografia de la aplicacion: funciones puras que interpretan el esquema de
// Prisma, el documento editable (docs/asesor/gestion.md) y la foto del build.
// Sin dependencias de Next ni de Prisma para poder probarlas.

// --- Foto del build (.next/gestion-snapshot.json) ------------------------------

export type SnapshotRoute = { ruta: string; tipo: "pagina" | "api"; archivo: string; metodos?: string[] };

export type SnapshotDeploy = {
  dockerfile: {
    contenido: string;
    imagenesBase: string[];
    env: string[];
    cmd: string | null;
    entrypoint: string | null;
    expose: string[];
  } | null;
  scriptsDeArranque: Array<{ archivo: string; contenido: string; usaSetE: boolean; correMigraciones: boolean }>;
  tieneDockerignore: boolean;
  workflows: Array<{
    archivo: string;
    nombre: string | null;
    ramasQueDisparan: string[];
    disparoManual: boolean;
    pasos: string[];
    imagenes: string[];
    webhookPortainer: boolean;
    correPruebas: boolean;
  }>;
  compose: Array<{
    archivo: string;
    servicios: Array<{
      nombre: string;
      imagen: string | null;
      variables: string[];
      replicas: number | null;
      restricciones: string[];
      dominios: string[];
      volumenes: string[];
    }>;
  }>;
};

export type AppSnapshot = {
  version: number;
  generadoEn: string;
  commit: string | null;
  rama: string | null;
  rutas: SnapshotRoute[];
  modulos: Array<{ nombre: string; capas: string[]; casosDeUso: string[] }>;
  accionesDeServidor: Array<{ archivo: string; acciones: string[] }>;
  reglasEnCodigo: Array<{ regla: string; archivo: string; funcion: string; encontrada: boolean; codigo: string | null }>;
  despliegue: SnapshotDeploy;
  documento: { archivo: string; contenido: string } | null;
  avisos: string[];
};

// --- Esquema de Prisma -----------------------------------------------------------

export type SchemaField = {
  nombre: string;
  tipo: string;
  opcional: boolean;
  lista: boolean;
  atributos: string;
  nota: string | null;
};

export type SchemaModel = { nombre: string; comentario: string | null; campos: SchemaField[] };
export type SchemaEnum = { nombre: string; valores: string[] };
export type ParsedSchema = { proveedor: string | null; modelos: SchemaModel[]; enums: SchemaEnum[] };

function splitInlineComment(line: string): { code: string; comment: string | null } {
  const index = line.indexOf("//");
  if (index < 0) return { code: line, comment: null };
  return { code: line.slice(0, index), comment: line.slice(index + 2).trim() || null };
}

export function parsePrismaSchema(text: string): ParsedSchema {
  const lines = text.split(/\r?\n/);
  const modelos: SchemaModel[] = [];
  const enums: SchemaEnum[] = [];
  let proveedor: string | null = null;
  let pendingComments: string[] = [];
  let block: { kind: "model" | "enum" | "other"; model?: SchemaModel; enumDef?: SchemaEnum } | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!block) {
      if (line.startsWith("//")) {
        pendingComments.push(line.replace(/^\/+\s?/, ""));
        continue;
      }
      const modelMatch = /^model\s+(\w+)\s*\{/.exec(line);
      const enumMatch = /^enum\s+(\w+)\s*\{/.exec(line);
      if (modelMatch) {
        const model: SchemaModel = {
          nombre: modelMatch[1],
          comentario: pendingComments.length > 0 ? pendingComments.join(" ") : null,
          campos: [],
        };
        modelos.push(model);
        block = { kind: "model", model };
      } else if (enumMatch) {
        const enumDef: SchemaEnum = { nombre: enumMatch[1], valores: [] };
        enums.push(enumDef);
        block = { kind: "enum", enumDef };
      } else if (/^\w+\s+\w*\s*\{/.test(line)) {
        block = { kind: "other" };
      }
      pendingComments = [];
      continue;
    }

    if (line.startsWith("}")) {
      block = null;
      continue;
    }

    if (block.kind === "other") {
      const providerMatch = /^provider\s*=\s*"([^"]+)"/.exec(line);
      if (providerMatch && proveedor === null && !/prisma-client/.test(providerMatch[1])) {
        proveedor = providerMatch[1];
      }
      continue;
    }

    if (!line || line.startsWith("//") || line.startsWith("@@")) continue;

    if (block.kind === "enum" && block.enumDef) {
      const { code } = splitInlineComment(line);
      for (const value of code.trim().split(/\s+/).filter(Boolean)) block.enumDef.valores.push(value);
      continue;
    }

    if (block.kind === "model" && block.model) {
      const { code, comment } = splitInlineComment(line);
      const fieldMatch = /^(\w+)\s+(\w+)(\[\])?(\?)?\s*(.*)$/.exec(code.trim());
      if (!fieldMatch) continue;
      block.model.campos.push({
        nombre: fieldMatch[1],
        tipo: fieldMatch[2],
        lista: Boolean(fieldMatch[3]),
        opcional: Boolean(fieldMatch[4]),
        atributos: fieldMatch[5].trim(),
        nota: comment,
      });
    }
  }

  return { proveedor, modelos, enums };
}

export type EntityRelation = { campo: string; con: string; cardinalidad: "uno" | "muchos"; opcional: boolean };

export function describeModelFields(model: SchemaModel, modelNames: Set<string>) {
  const relaciones: EntityRelation[] = [];
  const campos: string[] = [];
  for (const field of model.campos) {
    if (modelNames.has(field.tipo)) {
      relaciones.push({
        campo: field.nombre,
        con: field.tipo,
        cardinalidad: field.lista ? "muchos" : "uno",
        opcional: field.opcional,
      });
      continue;
    }
    const flags = [field.lista ? "[]" : "", field.opcional ? "?" : ""].join("");
    const extras = [
      /@id\b/.test(field.atributos) ? "id" : "",
      /@unique\b/.test(field.atributos) ? "unico" : "",
      field.nota ?? "",
    ].filter(Boolean);
    campos.push(`${field.nombre}: ${field.tipo}${flags}${extras.length > 0 ? ` (${extras.join("; ")})` : ""}`);
  }
  return { campos, relaciones };
}

// --- Documento editable ----------------------------------------------------------

export type OverviewDoc = {
  sections: Map<string, { titulo: string; contenido: string }>;
  modulos: Map<string, string>;
  entidades: Map<string, string>;
  pantallas: Map<string, string>;
};

export const DOC_SECTION_KEYS = {
  queHace: "que-hace-la-aplicacion",
  problema: "problema-de-negocio-que-resuelve",
  arquitectura: "patron-de-arquitectura",
  modulos: "modulos",
  entidades: "entidades",
  pantallas: "pantallas",
  reglas: "reglas-de-negocio",
  queNoTiene: "que-no-tiene-el-sistema",
  riesgos: "riesgos-de-operacion",
} as const;

export function normalizeSectionKey(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function parseListEntries(content: string): Map<string, string> {
  const entries = new Map<string, string>();
  for (const line of content.split(/\r?\n/)) {
    const match = /^\s*-\s*`([^`]+)`\s*:\s*(.+)$/.exec(line);
    if (match) entries.set(match[1].trim(), match[2].trim());
  }
  return entries;
}

export function parseOverviewDoc(markdown: string | null): OverviewDoc {
  const sections = new Map<string, { titulo: string; contenido: string }>();
  if (markdown) {
    const parts = markdown.split(/^##\s+/m).slice(1); // lo anterior al primer "##" es la guia de edicion
    for (const part of parts) {
      const newline = part.indexOf("\n");
      const titulo = (newline < 0 ? part : part.slice(0, newline)).trim();
      const contenido = (newline < 0 ? "" : part.slice(newline + 1)).trim();
      if (titulo) sections.set(normalizeSectionKey(titulo), { titulo, contenido });
    }
  }
  const listOf = (key: string) => parseListEntries(sections.get(key)?.contenido ?? "");
  return {
    sections,
    modulos: listOf(DOC_SECTION_KEYS.modulos),
    entidades: listOf(DOC_SECTION_KEYS.entidades),
    pantallas: listOf(DOC_SECTION_KEYS.pantallas),
  };
}

// --- Rutas -------------------------------------------------------------------------

export type AdminModuleInfo = { key: string; label: string; description: string; path: string; group: string };

// Quien puede entrar a una ruta, deducido de la ruta y del registro de modulos.
export function describeRouteAccess(route: string, adminModules: AdminModuleInfo[]): string {
  if (route.startsWith("/api/mcp")) return "Llave MCP_API_KEY";
  if (route === "/api/informe" || route === "/informe") return "Token del informe mensual";
  if (route === "/api/informe/link") return "Solo dueño (ADMIN) con sesión";
  if (route.startsWith("/api/auth")) return "Autenticación (next-auth)";
  if (route.startsWith("/api/")) return "Uso interno de la aplicación";
  if (route === "/admin" || route.startsWith("/admin/configuracion") || route === "/admin/productos/export") {
    return "Solo dueño (ADMIN)";
  }
  if (route.startsWith("/admin/")) {
    const owner = adminModules
      .filter((item) => route === item.path || route.startsWith(`${item.path}/`))
      .sort((left, right) => right.path.length - left.path.length)[0];
    return owner
      ? `Módulo "${owner.label}": dueño o empleado con ese módulo asignado`
      : "Panel interno (sesión requerida)";
  }
  if (route.includes("[token]")) return "Público con enlace secreto";
  if (["/profile", "/empleado", "/cliente"].includes(route)) return "Con sesión iniciada";
  return "Público";
}

export function describeRoute(route: string, docRoutes: Map<string, string>, adminModules: AdminModuleInfo[]): string | null {
  const fromDoc = docRoutes.get(route);
  if (fromDoc) return fromDoc;
  const adminModule = adminModules.find((item) => item.path === route);
  return adminModule ? adminModule.description : null;
}

// --- Despliegue ------------------------------------------------------------------

export function summarizeDeployFlow(deploy: SnapshotDeploy): string {
  const workflow = deploy.workflows[0];
  const service = deploy.compose.flatMap((file) => file.servicios)[0];
  const parts: string[] = [];
  if (workflow) {
    const branches = workflow.ramasQueDisparan.length > 0 ? workflow.ramasQueDisparan.join(", ") : "?";
    parts.push(`push a ${branches} → GitHub Actions ("${workflow.nombre ?? workflow.archivo}") construye la imagen Docker`);
  }
  const image = workflow?.imagenes[0] ?? service?.imagen;
  if (image) parts.push(`publica ${image}${image.startsWith("ghcr.io") ? " (GHCR)" : ""}`);
  if (workflow?.webhookPortainer) parts.push("avisa a Portainer por webhook para redesplegar");
  if (service) {
    const swarm = service.replicas !== null || service.restricciones.length > 0 ? "Docker Swarm" : "Docker";
    const traefik = service.dominios.length > 0 ? ` detrás de Traefik (${service.dominios.join(", ")})` : "";
    parts.push(`corre en ${swarm}${service.replicas !== null ? ` con ${service.replicas} réplica(s)` : ""}${traefik}`);
  }
  if (deploy.dockerfile?.cmd) parts.push(`al arrancar ejecuta ${deploy.dockerfile.cmd}`);
  return parts.join(" → ");
}

export type OperationalRisk = { riesgo: string; detalle: string; evidencia: string };

export function detectOperationalRisks(deploy: SnapshotDeploy): OperationalRisk[] {
  const risks: OperationalRisk[] = [];
  const startup = [deploy.dockerfile?.entrypoint, deploy.dockerfile?.cmd].filter(Boolean).join(" ");

  if (/migrate\s+deploy/.test(startup) && /&&/.test(startup)) {
    risks.push({
      riesgo: "Las migraciones corren antes de arrancar y bloquean el arranque",
      detalle:
        "El contenedor aplica las migraciones de Prisma y solo si salen bien arranca la app. Si una migración falla (o la base no responde), la app no arranca, el contenedor se reinicia en bucle y el sitio queda caído hasta corregirlo.",
      evidencia: `Dockerfile: ${startup}`,
    });
  }
  for (const script of deploy.scriptsDeArranque) {
    if (script.correMigraciones) {
      risks.push({
        riesgo: "Script de arranque corre migraciones",
        detalle: script.usaSetE
          ? "Con set -e, cualquier error en las migraciones detiene el script y la app no arranca."
          : "Revisa qué pasa si la migración falla: el script no usa set -e.",
        evidencia: script.archivo,
      });
    }
  }

  for (const workflow of deploy.workflows) {
    if (!workflow.correPruebas) {
      risks.push({
        riesgo: "No se corren pruebas antes de publicar",
        detalle: "El pipeline construye y despliega sin ejecutar `npm run test`; un error que las pruebas detectarían llega a producción.",
        evidencia: `${workflow.archivo}: pasos ${workflow.pasos.join(" / ")}`,
      });
    }
    if (workflow.ramasQueDisparan.includes("main") && workflow.webhookPortainer) {
      risks.push({
        riesgo: "Cada push a main va directo a producción",
        detalle: "No hay ambiente de pruebas ni aprobación previa: lo que entra a main se publica solo.",
        evidencia: `${workflow.archivo}: push a main + webhook de Portainer`,
      });
    }
    if (workflow.imagenes.length > 0 && workflow.imagenes.every((image) => image.endsWith(":latest"))) {
      risks.push({
        riesgo: "Solo se publica la etiqueta latest",
        detalle: "No queda una imagen anterior etiquetada para volver atrás rápido si un despliegue sale mal.",
        evidencia: workflow.imagenes.join(", "),
      });
    }
  }

  for (const service of deploy.compose.flatMap((file) => file.servicios)) {
    if (service.replicas === 1) {
      risks.push({
        riesgo: "Una sola réplica",
        detalle: "Durante cada redespliegue (o si el contenedor cae) el sitio no responde hasta que arranque de nuevo.",
        evidencia: `servicio ${service.nombre}: replicas 1`,
      });
    }
    if (service.volumenes.length > 0 && service.restricciones.some((item) => /manager/.test(item))) {
      risks.push({
        riesgo: "Archivos subidos atados a un solo nodo",
        detalle: "Comprobantes e imágenes viven en un volumen del nodo manager; sin respaldo, si ese servidor se pierde se pierden los archivos.",
        evidencia: `${service.volumenes.join(", ")} · ${service.restricciones.join(", ")}`,
      });
    }
  }

  if (!deploy.tieneDockerignore) {
    risks.push({
      riesgo: "Sin .dockerignore",
      detalle: "COPY . . mete todo el repositorio (incluido un posible .env local) en la etapa de construcción de la imagen.",
      evidencia: "No existe .dockerignore",
    });
  }

  return risks;
}
