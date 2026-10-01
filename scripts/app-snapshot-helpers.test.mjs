import { describe, expect, it } from "vitest";
import {
  analyzeStartupScript,
  extractExportedFunctions,
  extractFunctionSource,
  extractRouteMethods,
  parseCompose,
  parseWorkflow,
  routeFromAppFile,
} from "./app-snapshot-helpers.mjs";

describe("foto de la aplicacion", () => {
  it("convierte archivos de src/app en rutas, quitando los grupos", () => {
    expect(routeFromAppFile("src/app/(workspace)/admin/ordenes/[orderId]/page.tsx")).toBe("/admin/ordenes/[orderId]");
    expect(routeFromAppFile("src/app/(storefront)/page.tsx")).toBe("/");
    expect(routeFromAppFile("src\\app\\api\\mcp\\[key]\\route.ts")).toBe("/api/mcp/[key]");
  });

  it("lista funciones exportadas y metodos HTTP", () => {
    expect(extractExportedFunctions("export async function a() {}\nfunction b() {}\nexport function c() {}")).toEqual(["a", "c"]);
    expect(extractRouteMethods("export async function POST() {}\nexport function GET() {}")).toEqual(["POST", "GET"]);
    expect(extractRouteMethods("export const { GET, POST } = handlers;")).toEqual(["GET", "POST"]);
  });

  it("extrae una funcion con sus comentarios, ignorando llaves de los parametros", () => {
    const source = `const x = 1;

// Costo unitario.
// Segunda linea.
export function costo(params: { a: number; b: number }): number {
  if (params.a > 0) {
    return params.a;
  }
  return \`\${params.b}\`.length;
}

function otra() {}`;
    const code = extractFunctionSource(source, "costo");
    expect(code?.startsWith("// Costo unitario.\n// Segunda linea.\nexport function costo(")).toBe(true);
    expect(code?.endsWith("}")).toBe(true);
    expect(code).not.toContain("function otra");
    expect(extractFunctionSource(source, "noExiste")).toBeNull();
  });

  it("lee el workflow y el compose (solo nombres de variables)", () => {
    const workflow = parseWorkflow(`name: Docker Image CI
on:
  push:
    branches: [ "main" ]
  workflow_dispatch:
jobs:
  build:
    steps:
      - name: Checkout
      - name: Build and push image
        with:
          tags: ghcr.io/alexmorer/gestion:latest
      - name: Trigger Portainer redeploy
`);
    expect(workflow).toMatchObject({
      nombre: "Docker Image CI",
      ramasQueDisparan: ["main"],
      disparoManual: true,
      imagenes: ["ghcr.io/alexmorer/gestion:latest"],
      webhookPortainer: true,
      correPruebas: false,
    });

    const services = parseCompose(`version: "3.9"
services:
  magilus_app:
    image: ghcr.io/alexmorer/gestion:latest
    volumes:
      - magilus_uploads:/app/public/uploads
    environment:
      DATABASE_URL: "\${DATABASE_URL}"
      SECRETO: "valor-que-no-debe-salir"
    deploy:
      replicas: 1
      placement:
        constraints:
          - node.role == manager
      labels:
        - traefik.http.routers.magilus.rule=Host(\`magilus.com\`) || Host(\`www.magilus.com\`)
networks:
  red:
    external: true
`);
    expect(services).toEqual([
      {
        nombre: "magilus_app",
        imagen: "ghcr.io/alexmorer/gestion:latest",
        variables: ["DATABASE_URL", "SECRETO"],
        replicas: 1,
        restricciones: ["node.role == manager"],
        dominios: ["magilus.com", "www.magilus.com"],
        volumenes: ["magilus_uploads -> /app/public/uploads"],
      },
    ]);
    expect(JSON.stringify(services)).not.toContain("valor-que-no-debe-salir");
  });

  it("detecta set -e y migraciones en un script de arranque", () => {
    expect(analyzeStartupScript("#!/bin/sh\nset -eu\nnpx prisma migrate deploy\nnpm start")).toEqual({
      usaSetE: true,
      correMigraciones: true,
    });
  });
});
