"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import {
  listCitiesByDepartment,
  listCityOptions,
  listLocalitiesByCity,
  listLocalityOptions,
  resolveFreeShipping,
  searchTransportPlaces,
  setPlaceShippingType,
} from "@/modules/transporte/infrastructure/transporte-repository";
import type {
  TransportCityRow,
  TransportLocalityRow,
  TransportLookupResult,
  TransportOption,
  TransportSearchResult,
} from "@/modules/transporte/domain/entities";
import type { ShippingTypeName } from "@/modules/transporte/domain/shipping";

type ActionResult = { ok: boolean; error?: string };

const SHIPPING_TYPES: readonly ShippingTypeName[] = ["GRATIS", "ADICIONAL", "COTIZAR", "NO_LLEGA"];

// Verifica que quien llama sea un admin con acceso al modulo Transporte.
async function ensureTransportAdmin(): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.id) {
    return false;
  }
  return hasAdminModuleAccess(session.user.id, session.user.role, "transporte");
}

// --- Tipo de envio (solo admin) ---

// Guarda el tipo de envio de una ciudad o corregimiento. null = "Automatico (como antes)".
// Al guardar se quita la marca de "pendiente de revisar".
export async function adminSetPlaceShippingTypeAction(
  kind: "city" | "locality",
  id: string,
  shippingType: ShippingTypeName | null,
): Promise<ActionResult> {
  if (!(await ensureTransportAdmin())) {
    return { ok: false, error: "No autorizado" };
  }
  if ((kind !== "city" && kind !== "locality") || !id || (shippingType !== null && !SHIPPING_TYPES.includes(shippingType))) {
    return { ok: false, error: "Datos invalidos" };
  }
  try {
    await setPlaceShippingType(kind, id, shippingType);
    revalidatePath("/admin/transporte");
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo guardar el cambio" };
  }
}

// --- Lectura perezosa para el panel admin (solo admin) ---

export async function adminGetDepartmentCitiesAction(departmentId: string): Promise<TransportCityRow[]> {
  if (!(await ensureTransportAdmin())) {
    return [];
  }
  return listCitiesByDepartment(departmentId);
}

export async function adminGetCityLocalitiesAction(cityId: string): Promise<TransportLocalityRow[]> {
  if (!(await ensureTransportAdmin())) {
    return [];
  }
  return listLocalitiesByCity(cityId);
}

export async function adminSearchTransportAction(term: string): Promise<TransportSearchResult[]> {
  if (!(await ensureTransportAdmin())) {
    return [];
  }
  return searchTransportPlaces(term);
}

// --- Lectura publica (pagina del cliente, sin sesion) ---

export async function publicGetCitiesAction(departmentId: string): Promise<TransportOption[]> {
  if (!departmentId) {
    return [];
  }
  return listCityOptions(departmentId);
}

export async function publicGetLocalitiesAction(cityId: string): Promise<TransportOption[]> {
  if (!cityId) {
    return [];
  }
  return listLocalityOptions(cityId);
}

export async function publicCheckFreeShippingAction(
  cityId: string,
  localityId?: string | null,
): Promise<TransportLookupResult | null> {
  if (!cityId) {
    return null;
  }
  return resolveFreeShipping({ cityId, localityId: localityId ?? null });
}
