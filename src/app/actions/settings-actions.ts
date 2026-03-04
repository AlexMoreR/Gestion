"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/auth";
import { isSupportedCurrency, type SupportedCurrencyCode } from "@/lib/currency";
import { setSystemCurrency, setSystemPrimaryColor } from "@/lib/system-settings";

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

async function requireAdminSession(): Promise<void> {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    redirect("/unauthorized");
  }
}

export async function adminUpdateCurrencyAction(formData: FormData): Promise<void> {
  await requireAdminSession();

  const parsed = updateCurrencySchema.safeParse({
    currency: formData.get("currency"),
  });

  if (!parsed.success) {
    redirect("/admin/configuracion?error=Moneda+invalida");
  }

  await setSystemCurrency(parsed.data.currency);

  revalidatePath("/");
  revalidatePath("/admin/configuracion");
  revalidatePath("/admin/productos");
  revalidatePath("/admin/productos/new");
  redirect("/admin/configuracion?ok=Moneda+actualizada");
}

export async function adminUpdatePrimaryColorAction(formData: FormData): Promise<void> {
  await requireAdminSession();

  const parsed = updatePrimaryColorSchema.safeParse({
    primaryColor: formData.get("primaryColor"),
  });

  if (!parsed.success) {
    redirect("/admin/configuracion?error=Color+invalido");
  }

  await setSystemPrimaryColor(parsed.data.primaryColor);

  revalidatePath("/");
  revalidatePath("/login");
  revalidatePath("/register");
  revalidatePath("/admin");
  revalidatePath("/admin/configuracion");
  revalidatePath("/admin/productos");
  revalidatePath("/admin/productos/new");
  redirect("/admin/configuracion?ok=Color+actualizado");
}
