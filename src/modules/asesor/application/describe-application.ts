import {
  type AdminModuleInfo,
  describeModelFields,
  describeRoute,
  describeRouteAccess,
  detectOperationalRisks,
  DOC_SECTION_KEYS,
  parseOverviewDoc,
  parsePrismaSchema,
  summarizeDeployFlow,
} from "../domain/app-overview";
import type { AppIntrospectionSource } from "../domain/repository";

export const APP_OVERVIEW_SECTIONS = [
  "todo",
  "negocio",
  "stack",
  "arquitectura",
  "modelo_de_datos",
  "pantallas_y_rutas",
  "reglas_de_negocio",
  "lo_que_no_tiene",
  "riesgos_de_operacion",
  "volumen_de_datos",
] as const;

export type AppOverviewSection = (typeof APP_OVERVIEW_SECTIONS)[number];

// Informacion que vive en el codigo de la app y se pasa desde la capa de
// presentacion (registro de modulos, etiquetas, reglas de comision).
export type AppCodeFacts = {
  nodeVersion: string;
  adminModules: AdminModuleInfo[];
  quoteStatusLabels: Record<string, string>;
  commissionRates: { primeraVentaDelMes: number; desdeLaSegunda: number };
};

const KEY_PACKAGES = {
  framework: ["next", "react", "react-dom", "typescript"],
  orm: ["prisma", "@prisma/client", "@prisma/adapter-pg", "pg"],
  autenticacion: ["next-auth", "@auth/prisma-adapter", "bcryptjs"],
  estilos: ["tailwindcss", "@base-ui/react", "lucide-react"],
  otras: ["zod", "@tanstack/react-table", "react-hook-form", "puppeteer", "nodemailer", "recharts", "vitest"],
} as const;

const NOT_DOCUMENTED = null;

export async function describeApplicationUseCase(
  source: AppIntrospectionSource,
  facts: AppCodeFacts,
  section: AppOverviewSection,
) {
  const wants = (name: AppOverviewSection) => section === "todo" || section === name;

  const [schemaText, migrations, manifest, snapshot, liveDocument] = await Promise.all([
    source.readPrismaSchema(),
    source.listMigrations(),
    source.readPackageManifest(),
    source.readBuildSnapshot(),
    source.readOverviewDocument(),
  ]);

  const documentText = liveDocument ?? snapshot?.documento?.contenido ?? null;
  const doc = parseOverviewDoc(documentText);
  const docSection = (key: string) => doc.sections.get(key)?.contenido ?? NOT_DOCUMENTED;

  const schema = schemaText ? parsePrismaSchema(schemaText) : { proveedor: null, modelos: [], enums: [] };
  const modelNames = new Set(schema.modelos.map((model) => model.nombre));
  const enumValues = (name: string) => schema.enums.find((item) => item.nombre === name)?.valores ?? [];

  const needsCounts = wants("modelo_de_datos") || wants("volumen_de_datos");
  const counts = needsCounts ? await source.countRecords([...modelNames]) : {};

  const allPackages = Object.values(KEY_PACKAGES).flat();
  const installed = wants("stack") ? await source.readInstalledVersions(allPackages) : {};
  const declared = { ...(manifest?.devDependencies ?? {}), ...(manifest?.dependencies ?? {}) };
  const versionOf = (name: string) =>
    installed[name] ?? (declared[name] ? `${declared[name]} (declarada en package.json)` : null);
  const versions = (names: readonly string[]) =>
    Object.fromEntries(names.filter((name) => versionOf(name)).map((name) => [name, versionOf(name)]));

  const result: Record<string, unknown> = {
    aplicacion: manifest?.name ?? "Gestión",
    generado_en: new Date().toISOString(),
  };

  if (wants("negocio")) {
    result.negocio = {
      que_hace: docSection(DOC_SECTION_KEYS.queHace),
      problema_que_resuelve: docSection(DOC_SECTION_KEYS.problema),
    };
  }

  if (wants("stack")) {
    result.stack = {
      node: facts.nodeVersion,
      framework: versions(KEY_PACKAGES.framework),
      base_de_datos: { motor: schema.proveedor, orm: versions(KEY_PACKAGES.orm) },
      autenticacion: versions(KEY_PACKAGES.autenticacion),
      estilos_y_ui: versions(KEY_PACKAGES.estilos),
      otras_librerias: versions(KEY_PACKAGES.otras),
      despliegue: snapshot
        ? {
            flujo: summarizeDeployFlow(snapshot.despliegue),
            imagen_docker: snapshot.despliegue.dockerfile
              ? {
                  imagenes_base: snapshot.despliegue.dockerfile.imagenesBase,
                  variables_fijas: snapshot.despliegue.dockerfile.env,
                  comando_de_arranque: snapshot.despliegue.dockerfile.cmd,
                  entrypoint: snapshot.despliegue.dockerfile.entrypoint,
                }
              : null,
            scripts_de_arranque: snapshot.despliegue.scriptsDeArranque.map((script) => ({
              archivo: script.archivo,
              usa_set_e: script.usaSetE,
              corre_migraciones: script.correMigraciones,
            })),
            ci: snapshot.despliegue.workflows,
            orquestacion: snapshot.despliegue.compose,
          }
        : "No disponible: falta la foto del build (.next/gestion-snapshot.json).",
    };
  }

  if (wants("arquitectura")) {
    result.arquitectura = {
      patron: docSection(DOC_SECTION_KEYS.arquitectura),
      modulos_hexagonales: (snapshot?.modulos ?? []).map((module) => ({
        nombre: module.nombre,
        descripcion: doc.modulos.get(module.nombre) ?? NOT_DOCUMENTED,
        capas: module.capas,
        casos_de_uso: module.casosDeUso,
      })),
      modulos_del_panel: facts.adminModules.map((module) => ({
        clave: module.key,
        nombre: module.label,
        grupo: module.group,
        ruta: module.path,
        descripcion: module.description,
      })),
      acciones_de_servidor: snapshot?.accionesDeServidor ?? [],
    };
  }

  if (wants("modelo_de_datos")) {
    result.modelo_de_datos = {
      motor: schema.proveedor,
      entidades: schema.modelos.map((model) => {
        const { campos, relaciones } = describeModelFields(model, modelNames);
        const fromDoc = doc.entidades.get(model.nombre);
        return {
          nombre: model.nombre,
          descripcion: fromDoc ?? model.comentario ?? NOT_DOCUMENTED,
          relaciones,
          campos,
          registros: counts[model.nombre] ?? null,
        };
      }),
      enums: schema.enums,
      migraciones: { total: migrations.length, ultima: migrations.at(-1) ?? null },
    };
  }

  if (wants("pantallas_y_rutas")) {
    result.pantallas_y_rutas = (snapshot?.rutas ?? []).map((route) => ({
      ruta: route.ruta,
      tipo: route.tipo,
      ...(route.metodos ? { metodos: route.metodos } : {}),
      acceso: describeRouteAccess(route.ruta, facts.adminModules),
      descripcion: describeRoute(route.ruta, doc.pantallas, facts.adminModules),
    }));
  }

  if (wants("reglas_de_negocio")) {
    result.reglas_de_negocio = {
      explicacion: docSection(DOC_SECTION_KEYS.reglas),
      estados: {
        cotizacion: facts.quoteStatusLabels,
        venta: enumValues("SaleStatus"),
        orden: enumValues("OrderStatus"),
        tipo_de_orden: enumValues("OrderType"),
        modo_de_cumplimiento: enumValues("ProductFulfillmentMode"),
        despacho: enumValues("DispatchStatus"),
      },
      comisiones: facts.commissionRates,
      en_codigo: (snapshot?.reglasEnCodigo ?? []).map((rule) => ({
        regla: rule.regla,
        archivo: rule.archivo,
        funcion: rule.funcion,
        codigo: rule.codigo,
      })),
    };
  }

  if (wants("lo_que_no_tiene")) {
    result.lo_que_no_tiene = docSection(DOC_SECTION_KEYS.queNoTiene);
  }

  if (wants("riesgos_de_operacion")) {
    result.riesgos_de_operacion = {
      detectados_en_la_configuracion: snapshot ? detectOperationalRisks(snapshot.despliegue) : [],
      notas: docSection(DOC_SECTION_KEYS.riesgos),
    };
  }

  if (wants("volumen_de_datos")) {
    result.volumen_de_datos = counts;
  }

  if (section === "todo") {
    const knownKeys = new Set<string>(Object.values(DOC_SECTION_KEYS));
    const otherSections = [...doc.sections.entries()]
      .filter(([key]) => !knownKeys.has(key))
      .map(([, value]) => value);
    if (otherSections.length > 0) result.otras_notas = otherSections;

    result.pendiente_de_documentar = {
      entidades: schema.modelos
        .filter((model) => !doc.entidades.has(model.nombre) && !model.comentario)
        .map((model) => model.nombre),
      modulos: (snapshot?.modulos ?? []).filter((module) => !doc.modulos.has(module.nombre)).map((module) => module.nombre),
      rutas: (snapshot?.rutas ?? [])
        .filter((route) => !describeRoute(route.ruta, doc.pantallas, facts.adminModules))
        .map((route) => route.ruta),
      secciones: Object.values(DOC_SECTION_KEYS).filter((key) => !doc.sections.has(key)),
    };
  }

  result.fuentes = {
    en_vivo: [
      "prisma/schema.prisma (entidades, relaciones, enums)",
      "prisma/migrations",
      "package.json y node_modules (versiones instaladas)",
      "base de datos (conteo de registros)",
      "codigo de la app (modulos del panel, estados, comisiones)",
    ],
    foto_del_build: snapshot
      ? {
          generada_en: snapshot.generadoEn,
          commit: snapshot.commit,
          rama: snapshot.rama,
          avisos: snapshot.avisos,
          contiene: "rutas, modulos, casos de uso, acciones de servidor, reglas en codigo y despliegue",
        }
      : "No disponible (se genera con npm run build).",
    documento_editable: {
      archivo: "docs/asesor/gestion.md",
      leido_de: liveDocument ? "repositorio (en vivo)" : snapshot?.documento ? "foto del build" : "no disponible",
    },
  };

  return result;
}
