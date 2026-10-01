import { describe, expect, it } from "vitest";
import {
  describeModelFields,
  describeRoute,
  describeRouteAccess,
  detectOperationalRisks,
  normalizeSectionKey,
  parseOverviewDoc,
  parsePrismaSchema,
  type SnapshotDeploy,
  summarizeDeployFlow,
} from "./app-overview";

const SCHEMA = `
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
}

enum QuoteStatus {
  DRAFT
  SENT
}

// Cotizacion a un cliente.
model Quote {
  id        String      @id @default(cuid())
  code      String      @unique // COT-00001
  notes     String?
  status    QuoteStatus @default(DRAFT)
  items     QuoteItem[]
  sale      Sale?

  @@index([code])
}

model QuoteItem {
  id      String @id
  quoteId String
  quote   Quote  @relation(fields: [quoteId], references: [id])
}

model Sale {
  id String @id
}
`;

describe("esquema de Prisma", () => {
  const schema = parsePrismaSchema(SCHEMA);

  it("lee motor, modelos, comentarios y enums", () => {
    expect(schema.proveedor).toBe("postgresql");
    expect(schema.modelos.map((model) => model.nombre)).toEqual(["Quote", "QuoteItem", "Sale"]);
    expect(schema.modelos[0].comentario).toBe("Cotizacion a un cliente.");
    expect(schema.modelos[1].comentario).toBeNull();
    expect(schema.enums).toEqual([{ nombre: "QuoteStatus", valores: ["DRAFT", "SENT"] }]);
  });

  it("separa campos de relaciones con su cardinalidad", () => {
    const names = new Set(schema.modelos.map((model) => model.nombre));
    const { campos, relaciones } = describeModelFields(schema.modelos[0], names);
    expect(relaciones).toEqual([
      { campo: "items", con: "QuoteItem", cardinalidad: "muchos", opcional: false },
      { campo: "sale", con: "Sale", cardinalidad: "uno", opcional: true },
    ]);
    expect(campos).toContain("id: String (id)");
    expect(campos).toContain("code: String (unico; COT-00001)");
    expect(campos).toContain("notes: String?");
  });
});

describe("documento editable", () => {
  const doc = parseOverviewDoc(`# Titulo
Guia de edicion que se ignora.

## Qué hace la aplicación
Vende mobiliario.

## Entidades
- \`Quote\`: Cotizacion.
- \`Sale\`: Venta.

## Pantallas
- \`/cobertura\`: Envio gratis.

## Nota extra
Algo mas.
`);

  it("normaliza titulos con tildes", () => {
    expect(normalizeSectionKey("Qué NO tiene el sistema")).toBe("que-no-tiene-el-sistema");
  });

  it("lee secciones y listas", () => {
    expect(doc.sections.get("que-hace-la-aplicacion")?.contenido).toBe("Vende mobiliario.");
    expect(doc.entidades.get("Sale")).toBe("Venta.");
    expect(doc.pantallas.get("/cobertura")).toBe("Envio gratis.");
    expect(doc.sections.has("nota-extra")).toBe(true);
  });

  it("tolera que no haya documento", () => {
    expect(parseOverviewDoc(null).sections.size).toBe(0);
  });
});

describe("rutas", () => {
  const modules = [
    { key: "orders", label: "Ordenes", description: "Gestiona ordenes.", path: "/admin/ordenes", group: "Operaciones" },
  ];

  it("deduce quien puede entrar", () => {
    expect(describeRouteAccess("/admin/ordenes/[orderId]", modules)).toContain('Módulo "Ordenes"');
    expect(describeRouteAccess("/admin/configuracion/usuarios", modules)).toBe("Solo dueño (ADMIN)");
    expect(describeRouteAccess("/api/mcp/[key]", modules)).toBe("Llave MCP_API_KEY");
    expect(describeRouteAccess("/fabricacion/[token]", modules)).toBe("Público con enlace secreto");
    expect(describeRouteAccess("/cobertura", modules)).toBe("Público");
  });

  it("toma la descripcion del documento o del registro de modulos", () => {
    const docRoutes = new Map([["/cobertura", "Envio gratis."]]);
    expect(describeRoute("/cobertura", docRoutes, modules)).toBe("Envio gratis.");
    expect(describeRoute("/admin/ordenes", docRoutes, modules)).toBe("Gestiona ordenes.");
    expect(describeRoute("/sin-descripcion", docRoutes, modules)).toBeNull();
  });
});

describe("despliegue", () => {
  const deploy: SnapshotDeploy = {
    dockerfile: {
      contenido: "",
      imagenesBase: ["node:20-alpine AS runner"],
      env: ["TZ=America/Bogota"],
      cmd: '["sh", "-c", "npx prisma migrate deploy && npm run start"]',
      entrypoint: null,
      expose: ["3000"],
    },
    scriptsDeArranque: [],
    tieneDockerignore: true,
    workflows: [
      {
        archivo: ".github/workflows/docker-image.yml",
        nombre: "Docker Image CI",
        ramasQueDisparan: ["main"],
        disparoManual: true,
        pasos: ["Checkout", "Build and push image", "Trigger Portainer redeploy"],
        imagenes: ["ghcr.io/alexmorer/gestion:latest"],
        webhookPortainer: true,
        correPruebas: false,
      },
    ],
    compose: [
      {
        archivo: "docker-compose.portainer.yml",
        servicios: [
          {
            nombre: "magilus_app",
            imagen: "ghcr.io/alexmorer/gestion:latest",
            variables: ["DATABASE_URL"],
            replicas: 1,
            restricciones: ["node.role == manager"],
            dominios: ["magilus.com"],
            volumenes: ["magilus_uploads -> /app/public/uploads"],
          },
        ],
      },
    ],
  };

  it("resume el flujo de despliegue", () => {
    const flow = summarizeDeployFlow(deploy);
    expect(flow).toContain("push a main");
    expect(flow).toContain("GHCR");
    expect(flow).toContain("Portainer");
    expect(flow).toContain("Docker Swarm con 1 réplica(s) detrás de Traefik (magilus.com)");
  });

  it("detecta los riesgos de la configuracion real", () => {
    const risks = detectOperationalRisks(deploy).map((risk) => risk.riesgo);
    expect(risks).toEqual([
      "Las migraciones corren antes de arrancar y bloquean el arranque",
      "No se corren pruebas antes de publicar",
      "Cada push a main va directo a producción",
      "Solo se publica la etiqueta latest",
      "Una sola réplica",
      "Archivos subidos atados a un solo nodo",
    ]);
  });

  it("detecta un script de arranque con set -e", () => {
    const risks = detectOperationalRisks({
      ...deploy,
      dockerfile: null,
      workflows: [],
      compose: [],
      scriptsDeArranque: [
        { archivo: "docker/entrypoint.sh", contenido: "", usaSetE: true, correMigraciones: true },
      ],
    });
    expect(risks).toHaveLength(1);
    expect(risks[0].detalle).toContain("set -e");
  });
});
