import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const ADMIN_MODULE_ACCESS_SETTING_KEY = "adminModuleAccess";
// Acceso a modulos POR PERSONA (empleados). JSON: { [userId]: AdminModuleKey[] }.
const USER_MODULE_ACCESS_SETTING_KEY = "userModuleAccess";

// Modulos que un empleado NUNCA puede tener (solo el dueno/admin). Configuracion
// del negocio, usuarios y permisos quedan reservados al ADMIN.
export const EMPLOYEE_FORBIDDEN_MODULES: AdminModuleKey[] = [
  "config_users",
  "config_business",
  "config_permissions",
];

export const adminModuleDefinitions = [
  {
    key: "config_users",
    label: "Usuarios",
    description: "Gestiona cuentas, roles y accesos.",
    path: "/admin/configuracion/usuarios",
    group: "Configuracion",
  },
  {
    key: "config_business",
    label: "Configuracion negocio",
    description: "Moneda, marca y color principal del sistema.",
    path: "/admin/configuracion/negocio",
    group: "Configuracion",
  },
  {
    key: "config_permissions",
    label: "Control de modulos",
    description: "Define que modulos puede ver y abrir cada usuario.",
    path: "/admin/configuracion/permisos",
    group: "Configuracion",
  },
  {
    key: "products",
    label: "Productos",
    description: "Catalogo, creacion y edicion de productos.",
    path: "/admin/productos",
    group: "Catalogo",
  },
  {
    key: "categories",
    label: "Categorias",
    description: "Gestiona categorias del catalogo.",
    path: "/admin/categorias",
    group: "Catalogo",
  },
  {
    key: "suppliers",
    label: "Proveedores",
    description: "Gestiona proveedores del catalogo.",
    path: "/admin/proveedores",
    group: "Catalogo",
  },
  {
    key: "inventory",
    label: "Inventario",
    description: "Controla el stock y los movimientos de los productos.",
    path: "/admin/inventario",
    group: "Catalogo",
  },
  {
    key: "clients",
    label: "Clientes",
    description: "Directorio de clientes (se crean al cotizar).",
    path: "/admin/clientes",
    group: "Comercial",
  },
  {
    key: "quotes",
    label: "Cotizaciones",
    description: "Crea, edita y consulta cotizaciones.",
    path: "/admin/cotizaciones",
    group: "Comercial",
  },
  {
    key: "sales",
    label: "Ventas",
    description: "Gestiona ventas, comprobantes e invoices.",
    path: "/admin/ventas",
    group: "Comercial",
  },
  {
    key: "balances",
    label: "Balances",
    description: "Controla rentabilidad, pagos y costos logistico-financieros.",
    path: "/admin/balances",
    group: "Comercial",
  },
  {
    key: "expenses",
    label: "Gastos",
    description: "Registra gastos de nomina, marketing y varios por cuenta.",
    path: "/admin/gastos",
    group: "Comercial",
  },
  {
    key: "orders",
    label: "Ordenes",
    description: "Gestiona ordenes de cumplimiento y trazabilidad.",
    path: "/admin/ordenes",
    group: "Operaciones",
  },
  {
    key: "production",
    label: "Produccion",
    description: "Controla los trabajos de fabricacion.",
    path: "/admin/produccion",
    group: "Operaciones",
  },
  {
    key: "dispatches",
    label: "Despachos",
    description: "Administra salidas, guias y entregas.",
    path: "/admin/despachos",
    group: "Operaciones",
  },
  {
    key: "transporte",
    label: "Transporte",
    description: "Define en que ciudades y corregimientos aplica envio gratis.",
    path: "/admin/transporte",
    group: "Operaciones",
  },
] as const;

export type AdminModuleKey = (typeof adminModuleDefinitions)[number]["key"];

type RoleModuleAccessMap = Partial<Record<Role, AdminModuleKey[]>>;

async function ensureAppSettingTable(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AppSetting" (
      "key" TEXT NOT NULL PRIMARY KEY,
      "value" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function getAdminModuleKeySet(): Set<AdminModuleKey> {
  return new Set(adminModuleDefinitions.map((item) => item.key));
}

function sanitizeStoredModules(value: unknown): AdminModuleKey[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const validKeys = getAdminModuleKeySet();
  return value.filter((item): item is AdminModuleKey => typeof item === "string" && validKeys.has(item as AdminModuleKey));
}

function sanitizeRoleModuleAccessMap(value: unknown): RoleModuleAccessMap {
  if (!value || typeof value !== "object") {
    return {};
  }

  const source = value as Record<string, unknown>;
  const hasRoleKeys =
    Object.prototype.hasOwnProperty.call(source, "ADMIN") ||
    Object.prototype.hasOwnProperty.call(source, "EMPLEADO") ||
    Object.prototype.hasOwnProperty.call(source, "CLIENTE");

  if (!hasRoleKeys) {
    return {};
  }

  return {
    ADMIN: sanitizeStoredModules(source.ADMIN),
    EMPLEADO: sanitizeStoredModules(source.EMPLEADO),
    CLIENTE: sanitizeStoredModules(source.CLIENTE),
  };
}

export async function getStoredRoleModuleAccessMap(): Promise<RoleModuleAccessMap> {
  try {
    await ensureAppSettingTable();

    const rows = await prisma.$queryRaw<Array<{ value: string }>>`
      SELECT "value"
      FROM "AppSetting"
      WHERE "key" = ${ADMIN_MODULE_ACCESS_SETTING_KEY}
      LIMIT 1
    `;

    const rawValue = rows[0]?.value;
    if (!rawValue) {
      return {};
    }

    return sanitizeRoleModuleAccessMap(JSON.parse(rawValue));
  } catch {
    return {};
  }
}

export async function setStoredRoleModuleAccessMap(value: RoleModuleAccessMap): Promise<void> {
  await ensureAppSettingTable();
  await prisma.$executeRaw`
    INSERT INTO "AppSetting" ("key", "value", "createdAt", "updatedAt")
    VALUES (${ADMIN_MODULE_ACCESS_SETTING_KEY}, ${JSON.stringify(value)}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT ("key")
    DO UPDATE SET
      "value" = EXCLUDED."value",
      "updatedAt" = CURRENT_TIMESTAMP
  `;
}

// --- Acceso por persona (empleados) ---

export async function getStoredUserModuleAccessMap(): Promise<Record<string, AdminModuleKey[]>> {
  try {
    await ensureAppSettingTable();
    const rows = await prisma.$queryRaw<Array<{ value: string }>>`
      SELECT "value"
      FROM "AppSetting"
      WHERE "key" = ${USER_MODULE_ACCESS_SETTING_KEY}
      LIMIT 1
    `;
    const rawValue = rows[0]?.value;
    if (!rawValue) {
      return {};
    }
    const parsed = JSON.parse(rawValue);
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    const result: Record<string, AdminModuleKey[]> = {};
    for (const [userId, modules] of Object.entries(parsed as Record<string, unknown>)) {
      result[userId] = sanitizeStoredModules(modules);
    }
    return result;
  } catch {
    return {};
  }
}

export async function getUserModuleAccessList(userId: string): Promise<AdminModuleKey[]> {
  const map = await getStoredUserModuleAccessMap();
  return map[userId] ?? [];
}

export async function setUserModuleAccess(userId: string, modules: AdminModuleKey[]): Promise<void> {
  await ensureAppSettingTable();
  const map = await getStoredUserModuleAccessMap();
  // Nunca permitir modulos reservados al admin para un empleado.
  const forbidden = new Set(EMPLOYEE_FORBIDDEN_MODULES);
  map[userId] = sanitizeStoredModules(modules).filter((moduleKey) => !forbidden.has(moduleKey));
  await prisma.$executeRaw`
    INSERT INTO "AppSetting" ("key", "value", "createdAt", "updatedAt")
    VALUES (${USER_MODULE_ACCESS_SETTING_KEY}, ${JSON.stringify(map)}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT ("key")
    DO UPDATE SET
      "value" = EXCLUDED."value",
      "updatedAt" = CURRENT_TIMESTAMP
  `;
}

export function getDefaultAdminModuleAccess(role?: Role): Record<AdminModuleKey, boolean> {
  if (role === "ADMIN") {
    return Object.fromEntries(
      adminModuleDefinitions.map((item) => [item.key, true]),
    ) as Record<AdminModuleKey, boolean>;
  }

  return Object.fromEntries(
    adminModuleDefinitions.map((item) => [item.key, false]),
  ) as Record<AdminModuleKey, boolean>;
}

export async function getAdminModuleAccess(userId?: string, role?: Role): Promise<Record<AdminModuleKey, boolean>> {
  // El dueno/admin ve y entra a todo.
  if (role === "ADMIN") {
    return Object.fromEntries(
      adminModuleDefinitions.map((item) => [item.key, true]),
    ) as Record<AdminModuleKey, boolean>;
  }

  // Empleado: solo los modulos que se le habilitaron por persona (Equipos).
  if (role === "EMPLEADO" && userId) {
    const allowed = new Set(await getUserModuleAccessList(userId));
    const forbidden = new Set(EMPLOYEE_FORBIDDEN_MODULES);
    return Object.fromEntries(
      adminModuleDefinitions.map((item) => [item.key, allowed.has(item.key) && !forbidden.has(item.key)]),
    ) as Record<AdminModuleKey, boolean>;
  }

  // Cualquier otro caso (cliente o sin sesion): sin acceso.
  return Object.fromEntries(
    adminModuleDefinitions.map((item) => [item.key, false]),
  ) as Record<AdminModuleKey, boolean>;
}

export async function hasAdminModuleAccess(
  userId: string | undefined,
  role: Role | undefined,
  moduleKey: AdminModuleKey,
): Promise<boolean> {
  if (!userId || !role || role === "CLIENTE") {
    return false;
  }

  const access = await getAdminModuleAccess(userId, role);
  return access[moduleKey] ?? false;
}

// Para server actions: true si la persona tiene acceso a AL MENOS uno de los
// modulos indicados (ADMIN = todo; EMPLEADO = lo asignado en Equipos).
export async function hasAnyModuleAccess(
  userId: string | undefined,
  role: Role | undefined,
  moduleKeys: AdminModuleKey[],
): Promise<boolean> {
  if (!userId || !role || role === "CLIENTE") {
    return false;
  }
  const access = await getAdminModuleAccess(userId, role);
  return moduleKeys.some((moduleKey) => access[moduleKey] ?? false);
}

export function getVisibleAdminModuleDefinitions(access: Record<AdminModuleKey, boolean>) {
  return adminModuleDefinitions.filter((item) => access[item.key]);
}
