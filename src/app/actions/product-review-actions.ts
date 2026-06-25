"use server";

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const REVIEW_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

const createReviewSchema = z.object({
  productId: z.string().trim().min(1, "Producto invalido"),
  returnTo: z.string().trim().min(1).default("/"),
  authorName: z.string().trim().max(80, "Nombre demasiado largo").optional().or(z.literal("")),
  rating: z.coerce.number().int().min(1, "Calificacion invalida").max(5, "Calificacion invalida"),
  comment: z.string().trim().min(3, "El comentario es muy corto").max(1000, "El comentario es muy largo"),
  reviewDate: z.string().trim().optional().or(z.literal("")),
});

const deleteReviewSchema = z.object({
  reviewId: z.string().trim().min(1, "Resena invalida"),
  returnTo: z.string().trim().min(1).default("/"),
});

async function requireAdminSession(): Promise<void> {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    redirect("/unauthorized");
  }
}

function getStringField(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function redirectBack(returnTo: string, params: Record<string, string>): never {
  const query = new URLSearchParams(params).toString();
  redirect(`${returnTo}?${query}#resenas`);
}

async function saveReviewPhoto(file: File | null): Promise<string | null> {
  if (!file || file.size === 0) {
    return null;
  }
  if (!file.type.startsWith("image/")) {
    throw new Error("Solo se permiten archivos de imagen");
  }
  if (file.size > REVIEW_PHOTO_MAX_BYTES) {
    throw new Error("La foto debe pesar maximo 5MB");
  }

  const uploadDir = path.join(process.cwd(), "public", "uploads", "reviews");
  await mkdir(uploadDir, { recursive: true });

  const buffer = Buffer.from(await file.arrayBuffer());
  const rawExt = path.extname(file.name)?.toLowerCase() || ".jpg";
  const safeExt = /^\.[a-z0-9]{1,5}$/.test(rawExt) ? rawExt : ".jpg";
  const fileName = `${Date.now()}-${randomUUID()}${safeExt}`;
  await writeFile(path.join(uploadDir, fileName), buffer);

  return `/uploads/reviews/${fileName}`;
}

export async function adminCreateProductReviewAction(formData: FormData): Promise<void> {
  await requireAdminSession();

  const parsed = createReviewSchema.safeParse({
    productId: getStringField(formData, "productId"),
    returnTo: getStringField(formData, "returnTo") || "/",
    authorName: getStringField(formData, "authorName"),
    rating: getStringField(formData, "rating"),
    comment: getStringField(formData, "comment"),
    reviewDate: getStringField(formData, "reviewDate"),
  });

  if (!parsed.success) {
    const returnTo = getStringField(formData, "returnTo") || "/";
    redirectBack(returnTo, { error: parsed.error.issues[0]?.message ?? "Datos invalidos" });
  }

  const { productId, returnTo, authorName, rating, comment, reviewDate } = parsed.data;

  // Fecha opcional: si se indica una valida la usamos como fecha de la recomendacion.
  let createdAt: Date | undefined;
  if (reviewDate) {
    const parsedDate = new Date(reviewDate);
    if (!Number.isNaN(parsedDate.getTime())) {
      createdAt = parsedDate;
    }
  }

  const photoFile = formData.get("photo");
  let photoUrl: string | null = null;
  try {
    photoUrl = await saveReviewPhoto(photoFile instanceof File ? photoFile : null);
  } catch (error) {
    redirectBack(returnTo, { error: error instanceof Error ? error.message : "Foto invalida" });
  }

  await prisma.productReview.create({
    data: {
      productId,
      authorName: authorName ? authorName : null,
      rating,
      comment,
      photoUrl,
      ...(createdAt ? { createdAt } : {}),
    },
  });

  revalidatePath(returnTo);
  redirectBack(returnTo, { ok: "Recomendacion agregada" });
}

export async function adminDeleteProductReviewAction(formData: FormData): Promise<void> {
  await requireAdminSession();

  const parsed = deleteReviewSchema.safeParse({
    reviewId: getStringField(formData, "reviewId"),
    returnTo: getStringField(formData, "returnTo") || "/",
  });

  if (!parsed.success) {
    const returnTo = getStringField(formData, "returnTo") || "/";
    redirectBack(returnTo, { error: "Resena invalida" });
  }

  const { reviewId, returnTo } = parsed.data;

  await prisma.productReview.delete({ where: { id: reviewId } }).catch(() => null);

  revalidatePath(returnTo);
  redirectBack(returnTo, { ok: "Recomendacion eliminada" });
}
