"use server";

import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/auth";
import { isSupportedCurrency, type SupportedCurrencyCode } from "@/lib/currency";
import {
  getSystemStorefrontLogoPath,
  setSystemBrandName,
  setSystemCurrency,
  setSystemPrimaryColor,
  setSystemStorefrontHeroDescription,
  setSystemStorefrontHeroTitle,
  setSystemStorefrontLogoPath,
} from "@/lib/system-settings";

const updateCurrencySchema = z.object({
  currency: z
    .string()
    .trim()
    .refine(isSupportedCurrency, "Moneda invalida")
    .transform((value) => value as SupportedCurrencyCode),
});

const updatePrimaryColorSchema = z.object({
  primaryColor: z
    .string()
    .trim()
    .regex(/^#(?:[0-9a-fA-F]{3}){1,2}$/, "Color invalido"),
});

const updateBrandNameSchema = z.object({
  brandName: z.string().trim().min(2, "Nombre invalido").max(80, "Nombre demasiado largo"),
});

const updateStorefrontHeroSchema = z.object({
  heroTitle: z.string().trim().min(8, "Titulo invalido").max(120, "Titulo demasiado largo"),
  heroDescription: z.string().trim().min(12, "Descripcion invalida").max(220, "Descripcion demasiado larga"),
});

async function requireAdminSession(): Promise<void> {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    redirect("/unauthorized");
  }
}

async function saveStorefrontLogo(file: File | null): Promise<string | null> {
  if (!file || file.size <= 0) {
    return null;
  }

  if (!file.type.startsWith("image/")) {
    throw new Error("Logo principal invalido");
  }

  if (file.size > 2 * 1024 * 1024) {
    throw new Error("Logo principal invalido");
  }

  const uploadDir = path.join(process.cwd(), "public", "uploads", "settings");
  await mkdir(uploadDir, { recursive: true });

  const ext = path.extname(file.name)?.toLowerCase() || ".png";
  const safeExt = ext.length <= 8 ? ext : ".png";
  const fileName = `${Date.now()}-${randomUUID()}${safeExt}`;
  const filePath = path.join(uploadDir, fileName);

  await writeFile(filePath, Buffer.from(await file.arrayBuffer()));
  return `/uploads/settings/${fileName}`;
}

async function deleteStorefrontLogoFile(logoUrl: string | null | undefined): Promise<void> {
  if (!logoUrl || !logoUrl.startsWith("/uploads/settings/")) {
    return;
  }

  const normalizedPath = path.normalize(logoUrl).replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = path.join(process.cwd(), "public", normalizedPath);

  try {
    await unlink(filePath);
  } catch {
    // Ignore missing files so the stored setting remains the source of truth.
  }
}

function revalidateBusinessSurfaces(): void {
  revalidatePath("/", "layout");
  revalidatePath("/");
  revalidatePath("/login");
  revalidatePath("/register");
  revalidatePath("/admin");
  revalidatePath("/admin/configuracion");
  revalidatePath("/admin/configuracion/negocio");
}

export async function adminUpdateCurrencyAction(formData: FormData): Promise<void> {
  await requireAdminSession();

  const parsed = updateCurrencySchema.safeParse({
    currency: formData.get("currency"),
  });

  if (!parsed.success) {
    redirect("/admin/configuracion/negocio?error=Moneda+invalida");
  }

  await setSystemCurrency(parsed.data.currency);

  revalidateBusinessSurfaces();
  revalidatePath("/admin/productos");
  revalidatePath("/admin/productos/new");
  redirect("/admin/configuracion/negocio?ok=Moneda+actualizada");
}

export async function adminUpdatePrimaryColorAction(formData: FormData): Promise<void> {
  await requireAdminSession();

  const parsed = updatePrimaryColorSchema.safeParse({
    primaryColor: formData.get("primaryColor"),
  });

  if (!parsed.success) {
    redirect("/admin/configuracion/negocio?error=Color+invalido");
  }

  await setSystemPrimaryColor(parsed.data.primaryColor);

  revalidateBusinessSurfaces();
  revalidatePath("/admin/productos");
  revalidatePath("/admin/productos/new");
  redirect("/admin/configuracion/negocio?ok=Color+actualizado");
}

export async function adminUpdateBrandNameAction(formData: FormData): Promise<void> {
  await requireAdminSession();

  const parsed = updateBrandNameSchema.safeParse({
    brandName: formData.get("brandName"),
  });

  if (!parsed.success) {
    redirect("/admin/configuracion/negocio?error=Nombre+de+marca+invalido");
  }

  await setSystemBrandName(parsed.data.brandName);

  revalidateBusinessSurfaces();
  revalidatePath("/admin/productos");
  revalidatePath("/admin/proveedores");
  revalidatePath("/admin/categorias");
  redirect("/admin/configuracion/negocio?ok=Marca+actualizada");
}

export async function adminUpdateStorefrontHeroAction(formData: FormData): Promise<void> {
  await requireAdminSession();

  const parsed = updateStorefrontHeroSchema.safeParse({
    heroTitle: formData.get("heroTitle"),
    heroDescription: formData.get("heroDescription"),
  });

  if (!parsed.success) {
    redirect("/admin/configuracion/negocio?error=Textos+de+portada+invalidos");
  }

  await Promise.all([
    setSystemStorefrontHeroTitle(parsed.data.heroTitle),
    setSystemStorefrontHeroDescription(parsed.data.heroDescription),
  ]);

  revalidateBusinessSurfaces();
  redirect("/admin/configuracion/negocio?ok=Portada+actualizada");
}

export async function adminUpdateStorefrontLogoAction(formData: FormData): Promise<void> {
  await requireAdminSession();

  const rawLogo = formData.get("logo");
  const logoFile = rawLogo instanceof File ? rawLogo : null;

  if (!logoFile || logoFile.size <= 0) {
    redirect("/admin/configuracion/negocio?error=Selecciona+un+logo+valido");
  }

  const previousLogoPath = await getSystemStorefrontLogoPath();
  let nextLogoPath: string | null = null;

  try {
    nextLogoPath = await saveStorefrontLogo(logoFile);
    if (!nextLogoPath) {
      redirect("/admin/configuracion/negocio?error=Selecciona+un+logo+valido");
    }

    await setSystemStorefrontLogoPath(nextLogoPath);
  } catch {
    if (nextLogoPath) {
      await deleteStorefrontLogoFile(nextLogoPath);
    }
    redirect("/admin/configuracion/negocio?error=No+se+pudo+guardar+el+logo");
  }

  if (previousLogoPath !== nextLogoPath) {
    await deleteStorefrontLogoFile(previousLogoPath);
  }

  revalidateBusinessSurfaces();
  redirect("/admin/configuracion/negocio?ok=Logo+actualizado");
}
