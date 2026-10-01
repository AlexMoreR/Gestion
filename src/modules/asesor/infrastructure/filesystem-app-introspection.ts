import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import type { AppSnapshot } from "../domain/app-overview";
import type { AppIntrospectionSource, PackageManifest } from "../domain/repository";

// Lee la aplicacion en vivo desde el directorio de trabajo del proceso (en el
// contenedor: /app). SOLO LECTURA: archivos y conteos (count), nada mas.

const ROOT = process.cwd();
const SNAPSHOT_FILE = path.join(ROOT, ".next", "gestion-snapshot.json");
const DOC_FILE = path.join(ROOT, "docs", "asesor", "gestion.md");

async function readText(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

async function readJson<T>(filePath: string): Promise<T | null> {
  const text = await readText(filePath);
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

type CountDelegate = { count?: () => Promise<number> };

export function createFilesystemAppIntrospection(): AppIntrospectionSource {
  return {
    readPrismaSchema() {
      return readText(path.join(ROOT, "prisma", "schema.prisma"));
    },

    async listMigrations() {
      try {
        const entries = await readdir(path.join(ROOT, "prisma", "migrations"), { withFileTypes: true });
        return entries
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name)
          .sort();
      } catch {
        return [];
      }
    },

    async readPackageManifest(): Promise<PackageManifest | null> {
      const manifest = await readJson<{
        name?: string;
        version?: string;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      }>(path.join(ROOT, "package.json"));
      if (!manifest) return null;
      return {
        name: manifest.name ?? null,
        version: manifest.version ?? null,
        dependencies: manifest.dependencies ?? {},
        devDependencies: manifest.devDependencies ?? {},
      };
    },

    async readInstalledVersions(packageNames: string[]) {
      const entries = await Promise.all(
        packageNames.map(async (name) => {
          const manifest = await readJson<{ version?: string }>(
            path.join(ROOT, "node_modules", ...name.split("/"), "package.json"),
          );
          return [name, manifest?.version ?? null] as const;
        }),
      );
      return Object.fromEntries(entries);
    },

    readBuildSnapshot() {
      return readJson<AppSnapshot>(SNAPSHOT_FILE);
    },

    readOverviewDocument() {
      return readText(DOC_FILE);
    },

    async countRecords(modelNames: string[]) {
      const client = prisma as unknown as Record<string, CountDelegate | undefined>;
      const entries = await Promise.all(
        modelNames.map(async (modelName) => {
          const delegate = client[modelName.charAt(0).toLowerCase() + modelName.slice(1)];
          if (typeof delegate?.count !== "function") return [modelName, null] as const;
          try {
            return [modelName, await delegate.count()] as const;
          } catch {
            return [modelName, null] as const;
          }
        }),
      );
      return Object.fromEntries(entries);
    },
  };
}
