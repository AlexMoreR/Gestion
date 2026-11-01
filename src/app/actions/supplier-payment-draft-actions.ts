"use server";

import { revalidatePath } from "next/cache";
import {
  receiveSupplierPaymentReceipt,
  type PaymentReceiptSubmission,
} from "@/modules/proveedores/application/register-supplier-payment-by-voice";
import { createPrismaSupplierPaymentDeps } from "@/modules/proveedores/infrastructure/prisma-supplier-payment-repository";

// Accion publica (sin sesion): recibe la foto del comprobante de un pago a proveedora registrado por
// Claude y la pega al pago ya guardado. El acceso es el enlace secreto (un solo uso, 24 horas).
export async function submitSupplierPaymentReceiptAction(
  token: string,
  formData: FormData,
): Promise<PaymentReceiptSubmission> {
  const file = formData.get("receipt");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, reason: "Elige o toma una foto primero.", canRetry: true };
  }
  try {
    const result = await receiveSupplierPaymentReceipt(createPrismaSupplierPaymentDeps(), String(token), file);
    if (result.ok) {
      revalidatePath("/admin/proveedores", "layout");
      revalidatePath("/admin/ordenes", "layout");
    }
    return result;
  } catch (error) {
    console.error("[pago-proveedora-voz] Fallo al recibir la foto:", error);
    return { ok: false, reason: "No se pudo guardar la foto. Intenta de nuevo en un momento.", canRetry: true };
  }
}
