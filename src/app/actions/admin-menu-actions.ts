"use server";

import { auth } from "@/auth";
import { getAdminModuleAccess } from "@/lib/admin-module-access";

// Menu admin del Navbar de la tienda: lo pide el navegador (el layout ya no lee la sesion).
// Sin sesion devuelve null; con sesion, los modulos de esa persona.
export async function getMyAdminModuleAccessAction() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return getAdminModuleAccess(session.user.id, session.user.role);
}
