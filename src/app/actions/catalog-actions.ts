"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const createCategorySchema = z.object({
  name: z.string().trim().min(2, "Nombre invalido").max(80, "Nombre demasiado largo"),
});

const createSupplierSchema = z.object({
  name: z.string().trim().min(2, "Nombre invalido").max(120, "Nombre demasiado largo"),
  email: z
    .string()
    .trim()
    .email("Correo invalido")
    .optional()
    .or(z.literal("")),
  phone: z.string().trim().max(40, "Telefono demasiado largo").optional().or(z.literal("")),
});

function slugifyCategory(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

async function requireAdminSession(): Promise<void> {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    redirect("/unauthorized");
  }
}

export async function adminCreateCategoryAction(formData: FormData): Promise<void> {
  await requireAdminSession();

  const parsed = createCategorySchema.safeParse({
    name: formData.get("name"),
  });

  if (!parsed.success) {
    redirect("/admin/configuracion?error=Categoria+invalida");
  }

  const slugBase = slugifyCategory(parsed.data.name);
  if (!slugBase) {
    redirect("/admin/configuracion?error=Categoria+invalida");
  }

  const existingBySlug = await prisma.category.count({
    where: {
      slug: {
        startsWith: slugBase,
      },
    },
  });
  const slug = existingBySlug > 0 ? `${slugBase}-${existingBySlug + 1}` : slugBase;

  try {
    await prisma.category.create({
      data: {
        name: parsed.data.name,
        slug,
      },
    });
  } catch {
    redirect("/admin/configuracion?error=No+se+pudo+crear+la+categoria");
  }

  revalidatePath("/admin/configuracion");
  revalidatePath("/admin/productos");
  revalidatePath("/admin/productos/new");
  redirect("/admin/configuracion?ok=Categoria+creada");
}

export async function adminCreateSupplierAction(formData: FormData): Promise<void> {
  await requireAdminSession();

  const parsed = createSupplierSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email") ?? "",
    phone: formData.get("phone") ?? "",
  });

  if (!parsed.success) {
    redirect("/admin/configuracion?error=Proveedor+invalido");
  }

  try {
    await prisma.supplier.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email || null,
        phone: parsed.data.phone || null,
      },
    });
  } catch {
    redirect("/admin/configuracion?error=No+se+pudo+crear+el+proveedor");
  }

  revalidatePath("/admin/configuracion");
  revalidatePath("/admin/productos");
  revalidatePath("/admin/productos/new");
  redirect("/admin/configuracion?ok=Proveedor+creado");
}
