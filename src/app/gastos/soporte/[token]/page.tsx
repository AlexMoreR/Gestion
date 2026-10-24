import type { Metadata } from "next";
import { formatCop } from "@/modules/expenses/domain/receipt-check";
import { lookupOpenDraft } from "@/modules/expenses/application/register-expense-by-voice";
import { createVoiceExpenseDeps } from "@/modules/expenses/infrastructure/voice-expense-deps";
import { SoporteForm } from "./soporte-form";

// Enlace secreto para subir la foto del soporte de un gasto dicho a Claude. Solo muestra el
// gasto que se va a guardar (categoria, monto, cuenta, fecha); nada mas. Un solo uso, 30 minutos.

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ token: string }> };

export const metadata: Metadata = {
  title: "Foto del soporte",
  robots: { index: false, follow: false },
  // El token no debe salir por Referer hacia otros sitios.
  referrer: "no-referrer",
};

export default async function SoportePage({ params }: PageProps) {
  const { token } = await params;
  let lookup: Awaited<ReturnType<typeof lookupOpenDraft>>;
  try {
    lookup = await lookupOpenDraft(createVoiceExpenseDeps(), token);
  } catch (error) {
    console.error("[gastos-voz] Fallo al abrir el enlace:", error);
    lookup = { ok: false, reason: "No pudimos abrir el enlace. Intenta de nuevo en un momento." };
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8">
      <div className="mx-auto max-w-md space-y-4">
        <h1 className="text-xl font-semibold text-slate-900">Foto del soporte del gasto</h1>
        {lookup.ok ? (
          <>
            <dl className="space-y-1 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-800">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Categoría</dt>
                <dd className="font-medium">{lookup.draft.categoryName}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Monto</dt>
                <dd className="font-medium">{formatCop(lookup.draft.amount)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Cuenta</dt>
                <dd className="font-medium">{lookup.draft.accountName}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Fecha</dt>
                <dd className="font-medium">{lookup.draft.expenseDate.toISOString().slice(0, 10)}</dd>
              </div>
            </dl>
            <p className="text-sm text-slate-600">
              La foto tiene que ser un comprobante de pago (transferencia, Nequi/Daviplata, factura o recibo) por{" "}
              {formatCop(lookup.draft.amount)}.
              {lookup.draft.accountType === "CASH" ? " Si pagaste en efectivo, sirve la foto del dinero o del recibo firmado." : ""}{" "}
              Si la foto no sirve, el gasto no se guarda.
            </p>
            <SoporteForm token={token} />
          </>
        ) : (
          <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">{lookup.reason}</p>
        )}
      </div>
    </main>
  );
}
