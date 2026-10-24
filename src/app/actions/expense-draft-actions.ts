"use server";

import { revalidatePath } from "next/cache";
import { receiveVoiceExpenseReceipt, type ReceiptSubmission } from "@/modules/expenses/application/register-expense-by-voice";
import { createVoiceExpenseDeps } from "@/modules/expenses/infrastructure/voice-expense-deps";

// Accion publica (sin sesion): recibe la foto del soporte de un gasto dicho a Claude. El acceso
// es el enlace secreto (un solo uso, 30 minutos); la foto se revisa antes de guardar nada.
export async function submitExpenseReceiptAction(token: string, formData: FormData): Promise<ReceiptSubmission> {
  const file = formData.get("receipt");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, reason: "Elige o toma una foto primero.", canRetry: true };
  }
  try {
    const result = await receiveVoiceExpenseReceipt(createVoiceExpenseDeps(), String(token), {
      bytes: new Uint8Array(await file.arrayBuffer()),
      name: file.name,
    });
    if (result.ok) {
      revalidatePath("/admin/gastos");
      revalidatePath("/admin/balances");
    }
    return result;
  } catch (error) {
    console.error("[gastos-voz] Fallo al recibir la foto:", error);
    return { ok: false, reason: "No se pudo guardar el gasto. Intenta de nuevo en un momento.", canRetry: true };
  }
}
