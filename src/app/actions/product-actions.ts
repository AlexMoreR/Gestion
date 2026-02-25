"use server";

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { calculateRetailPrice, calculateWholesalePrice } from "@/lib/pricing";

const baseProductSchema = z.object({
  code: z.string().trim().max(60, "Codigo demasiado largo").optional(),
  name: z.string().trim().min(2, "Nombre invalido").max(120, "Nombre demasiado largo"),
  description: z.string().trim().max(4000, "Descripcion demasiado larga").optional(),
  baseCost: z.coerce.number().positive("El costo debe ser mayor que 0"),
  retailMarginPct: z.coerce.number().min(0, "El margen detal no puede ser negativo").max(1000),
  wholesaleMarginPct: z.coerce.number().min(0, "El margen mayorista no puede ser negativo").max(1000),
  minWholesaleQty: z.coerce.number().int().min(1, "Cantidad mayorista invalida").max(100000),
  categoryId: z.string().trim().optional(),
  supplierId: z.string().trim().optional(),
});

const createProductSchema = baseProductSchema;

const updateProductSchema = baseProductSchema.extend({
  productId: z.string().trim().min(1, "Producto invalido"),
  images: z.string().trim().min(1, "Debes agregar al menos una imagen"),
});

const deleteProductSchema = z.object({
  productId: z.string().trim().min(1, "Producto invalido"),
});

async function requireAdminSession(): Promise<void> {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    redirect("/unauthorized");
  }
}

function parseOptionalId(value?: string): string | null {
  const raw = value?.trim();
  return raw ? raw : null;
}

function parseImageList(raw: string): string[] {
  return raw
    .split(/[\n,]/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function assertValidImageList(images: string[]): void {
  if (images.length === 0) {
    throw new Error("Debes agregar al menos una imagen");
  }

  for (const image of images) {
    const result = z.string().url("URL de imagen invalida").safeParse(image);
    if (!result.success) {
      throw new Error(`URL de imagen invalida: ${image}`);
    }
  }
}

async function saveUploadedImages(files: File[]): Promise<string[]> {
  if (files.length === 0) {
    throw new Error("Debes subir al menos una imagen");
  }

  const uploadDir = path.join(process.cwd(), "public", "uploads", "products");
  await mkdir(uploadDir, { recursive: true });

  const savedUrls: string[] = [];

  for (const file of files) {
    if (!file.type.startsWith("image/")) {
      throw new Error("Solo se permiten archivos de imagen");
    }

    if (file.size <= 0) {
      throw new Error("Archivo de imagen vacio");
    }

    if (file.size > 5 * 1024 * 1024) {
      throw new Error("Cada imagen debe pesar maximo 5MB");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = path.extname(file.name)?.toLowerCase() || ".jpg";
    const safeExt = ext.length <= 8 ? ext : ".jpg";
    const fileName = `${Date.now()}-${randomUUID()}${safeExt}`;
    const filePath = path.join(uploadDir, fileName);

    await writeFile(filePath, buffer);
    savedUrls.push(`/uploads/products/${fileName}`);
  }

  return savedUrls;
}

export async function adminCreateProductAction(formData: FormData): Promise<void> {
  await requireAdminSession();

  const parsed = createProductSchema.safeParse({
    code: formData.get("code") || undefined,
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    baseCost: formData.get("baseCost"),
    retailMarginPct: formData.get("retailMarginPct"),
    wholesaleMarginPct: formData.get("wholesaleMarginPct"),
    minWholesaleQty: formData.get("minWholesaleQty"),
    categoryId: formData.get("categoryId") || undefined,
    supplierId: formData.get("supplierId") || undefined,
  });

  if (!parsed.success) {
    redirect("/admin/productos?error=Datos+invalidos");
  }

  const files = formData
    .getAll("images")
    .filter((item): item is File => item instanceof File && item.size > 0);

  let imageList: string[];
  try {
    imageList = await saveUploadedImages(files);
  } catch {
    redirect("/admin/productos?error=Las+imagenes+subidas+son+invalidas");
  }

  const thumbnailUrl = imageList[0];
  const categoryId = parseOptionalId(parsed.data.categoryId);
  const supplierId = parseOptionalId(parsed.data.supplierId);
  const retailPrice = calculateRetailPrice(parsed.data.baseCost, parsed.data.retailMarginPct);
  const wholesalePrice = calculateWholesalePrice(parsed.data.baseCost, parsed.data.wholesaleMarginPct);

  try {
    await prisma.product.create({
      data: {
        name: parsed.data.name,
        code: parsed.data.code || null,
        description: parsed.data.description || null,
        baseCost: parsed.data.baseCost,
        retailMarginPct: parsed.data.retailMarginPct,
        wholesaleMarginPct: parsed.data.wholesaleMarginPct,
        minWholesaleQty: parsed.data.minWholesaleQty,
        price: retailPrice,
        wholesalePrice,
        categoryId,
        thumbnailUrl,
        images: {
          create: imageList.map((url, index) => ({
            url,
            order: index,
          })),
        },
        suppliers: supplierId
          ? {
              create: {
                supplierId,
                supplierCost: parsed.data.baseCost,
                isPreferred: true,
              },
            }
          : undefined,
      },
    });
  } catch {
    redirect("/admin/productos?error=No+se+pudo+crear+el+producto+(codigo+duplicado?)");
  }

  revalidatePath("/");
  revalidatePath("/admin/productos");
  redirect("/admin/productos?ok=Producto+creado");
}

export async function adminUpdateProductAction(formData: FormData): Promise<void> {
  await requireAdminSession();

  const parsed = updateProductSchema.safeParse({
    productId: formData.get("productId"),
    code: formData.get("code") || undefined,
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    baseCost: formData.get("baseCost"),
    retailMarginPct: formData.get("retailMarginPct"),
    wholesaleMarginPct: formData.get("wholesaleMarginPct"),
    minWholesaleQty: formData.get("minWholesaleQty"),
    categoryId: formData.get("categoryId") || undefined,
    supplierId: formData.get("supplierId") || undefined,
    images: formData.get("images"),
  });

  if (!parsed.success) {
    redirect("/admin/productos?error=Datos+invalidos");
  }

  const imageList = parseImageList(parsed.data.images);
  try {
    assertValidImageList(imageList);
  } catch {
    redirect("/admin/productos?error=Las+imagenes+deben+ser+URLs+validas");
  }

  const thumbnailUrl = imageList[0];
  const categoryId = parseOptionalId(parsed.data.categoryId);
  const supplierId = parseOptionalId(parsed.data.supplierId);
  const retailPrice = calculateRetailPrice(parsed.data.baseCost, parsed.data.retailMarginPct);
  const wholesalePrice = calculateWholesalePrice(parsed.data.baseCost, parsed.data.wholesaleMarginPct);

  try {
    await prisma.$transaction([
      prisma.product.update({
        where: { id: parsed.data.productId },
        data: {
          name: parsed.data.name,
          code: parsed.data.code || null,
          description: parsed.data.description || null,
          baseCost: parsed.data.baseCost,
          retailMarginPct: parsed.data.retailMarginPct,
          wholesaleMarginPct: parsed.data.wholesaleMarginPct,
          minWholesaleQty: parsed.data.minWholesaleQty,
          price: retailPrice,
          wholesalePrice,
          categoryId,
          thumbnailUrl,
        },
      }),
      prisma.productImage.deleteMany({
        where: { productId: parsed.data.productId },
      }),
      prisma.productImage.createMany({
        data: imageList.map((url, index) => ({
          productId: parsed.data.productId,
          url,
          order: index,
        })),
      }),
      prisma.productSupplier.deleteMany({
        where: { productId: parsed.data.productId },
      }),
      ...(supplierId
        ? [
            prisma.productSupplier.create({
              data: {
                productId: parsed.data.productId,
                supplierId,
                supplierCost: parsed.data.baseCost,
                isPreferred: true,
              },
            }),
          ]
        : []),
    ]);
  } catch {
    redirect("/admin/productos?error=No+se+pudo+actualizar+el+producto+(codigo+duplicado?)");
  }

  revalidatePath("/");
  revalidatePath("/admin/productos");
  redirect("/admin/productos?ok=Producto+actualizado");
}

export async function adminDeleteProductAction(formData: FormData): Promise<void> {
  await requireAdminSession();

  const parsed = deleteProductSchema.safeParse({
    productId: formData.get("productId"),
  });

  if (!parsed.success) {
    redirect("/admin/productos?error=Producto+invalido");
  }

  await prisma.product.delete({
    where: { id: parsed.data.productId },
  });

  revalidatePath("/");
  revalidatePath("/admin/productos");
  redirect("/admin/productos?ok=Producto+eliminado");
}
