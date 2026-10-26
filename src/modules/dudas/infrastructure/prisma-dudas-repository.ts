import bcrypt from "bcryptjs";
import type { PrismaClient } from "@prisma/client";

import { prisma as prismaApp } from "@/lib/prisma";
import { leerDatos, leerLinks, leerOpciones, type Duda, type Respuesta } from "../domain/duda";
import { crearFrenoIntentos } from "../domain/freno-intentos";
import { secretoSesionDudas } from "../domain/sesion";
import type { AccesoGuardado, DudasRepository, LoginDeps } from "../application/use-cases";

type FilaDuda = {
  id: string;
  codigo: string | null;
  grupo: string;
  titulo: string;
  duda: string;
  orden: number;
  datos: unknown;
  opciones: unknown;
  links: unknown;
  extra: unknown;
  activa: boolean;
};

export function aDuda(fila: FilaDuda): Duda {
  return {
    id: fila.id,
    codigo: fila.codigo,
    grupo: fila.grupo,
    titulo: fila.titulo,
    duda: fila.duda,
    orden: fila.orden,
    datos: leerDatos(fila.datos),
    opciones: leerOpciones(fila.opciones),
    links: leerLinks(fila.links),
    extra: fila.extra && typeof fila.extra === "object" && !Array.isArray(fila.extra) ? (fila.extra as Record<string, unknown>) : null,
    activa: fila.activa,
  };
}

const camposAcceso = { id: true, nombre: true, codigoHash: true, activo: true, createdAt: true, ultimoUso: true } as const;

export function createPrismaDudasRepository(prisma: PrismaClient = prismaApp): DudasRepository {
  return {
    async listarDudas() {
      const filas = await prisma.dudaCatalogo.findMany({ orderBy: [{ grupo: "asc" }, { orden: "asc" }] });
      return filas.map(aDuda);
    },
    async buscarDuda(id) {
      const fila = await prisma.dudaCatalogo.findUnique({ where: { id } });
      return fila ? aDuda(fila) : null;
    },
    async listarRespuestas() {
      return prisma.respuestaDuda.findMany({ orderBy: { createdAt: "asc" } }) as Promise<Respuesta[]>;
    },
    async crearRespuesta(datos) {
      return prisma.respuestaDuda.create({ data: datos }) as Promise<Respuesta>;
    },
    async listarAccesosActivos() {
      return prisma.accesoDudas.findMany({ where: { activo: true }, select: camposAcceso, orderBy: { createdAt: "asc" } });
    },
    async buscarAcceso(id) {
      return prisma.accesoDudas.findUnique({ where: { id }, select: camposAcceso });
    },
    async marcarUso(id, fecha) {
      await prisma.accesoDudas.updateMany({ where: { id }, data: { ultimoUso: fecha } });
    },
    async crearAcceso(datos) {
      return prisma.accesoDudas.create({ data: datos, select: camposAcceso });
    },
    async desactivarAcceso(id) {
      await prisma.accesoDudas.updateMany({ where: { id }, data: { activo: false } });
    },
    async listarAccesos(): Promise<AccesoGuardado[]> {
      return prisma.accesoDudas.findMany({ select: camposAcceso, orderBy: [{ activo: "desc" }, { createdAt: "desc" }] });
    },
  };
}

// 5 intentos fallidos por IP cada 15 min; 300 fallos en total cada 15 min (todas las IP).
const globalFreno = globalThis as unknown as { __frenoDudas?: ReturnType<typeof crearFrenoIntentos> };
export const frenoDudas =
  globalFreno.__frenoDudas ?? (globalFreno.__frenoDudas = crearFrenoIntentos({ maxFallos: 5, ventanaMs: 15 * 60_000, maxFallosGlobal: 300 }));

export function hashearCodigo(codigo: string): Promise<string> {
  return bcrypt.hash(codigo, 10);
}

export function createDudasDeps(): LoginDeps {
  return {
    repo: createPrismaDudasRepository(),
    secreto: secretoSesionDudas(),
    freno: frenoDudas,
    compararCodigo: (codigo, hash) => bcrypt.compare(codigo, hash),
  };
}
