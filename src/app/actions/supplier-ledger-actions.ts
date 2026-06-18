"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const createPaymentSchema = z.object({
  supplierId: z.string().trim().min(1, "Proveedor invalido"),
  amount: z.coerce.number().positive("El monto debe ser mayor a cero"),
  note: z.string().trim().max(2000, "Nota demasiado larga").optional(),
  accountId: z.string().trim().min(1).optional(),
  paymentDate: z.coerce.date().optional(),
});

async function requireAdminSession(): Promise<string> {
  const session = await auth();
  if (session?.user?.role !== "ADMIN" || !session.user.id) {
    redirect("/unauthorized");
  }

  return session.user.id;
}

function getReturnTo(formData: FormData, fallback: string): string {
  const raw = formData.get("returnTo");
  if (typeof raw !== "string") {
    return fallback;
  }

  const value = raw.trim();
  return value || fallback;
}

export async function adminCreateSupplierPaymentAction(formData: FormData): Promise<void> {
  const createdById = await requireAdminSession();
  const returnTo = getReturnTo(formData, "/admin/proveedores");

  const parsed = createPaymentSchema.safeParse({
    supplierId: formData.get("supplierId"),
    amount: formData.get("amount"),
    note: formData.get("note") || undefined,
    accountId: formData.get("accountId") || undefined,
    paymentDate: formData.get("paymentDate") || undefined,
  });

  if (!parsed.success) {
    redirect(`${returnTo}?error=Datos+del+abono+invalidos`);
  }

  const supplier = await prisma.supplier.findUnique({
    where: { id: parsed.data.supplierId },
    select: { id: true },
  });

  if (!supplier) {
    redirect(`${returnTo}?error=Proveedor+no+encontrado`);
  }

  let accountId: string | null = null;
  if (parsed.data.accountId) {
    const account = await prisma.account.findFirst({
      where: { id: parsed.data.accountId, isActive: true },
      select: { id: true },
    });
    if (!account) {
      redirect(`${returnTo}?error=Cuenta+no+encontrada`);
    }
    accountId = account.id;
  }

  await prisma.supplierLedgerEntry.create({
    data: {
      supplierId: supplier.id,
      type: "PAYMENT",
      amount: parsed.data.amount,
      note: parsed.data.note || null,
      accountId,
      paymentDate: parsed.data.paymentDate ?? new Date(),
      createdById,
    },
  });

  revalidatePath("/admin/proveedores");
  redirect(`${returnTo}?ok=Abono+registrado`);
}
