import type { Metadata } from "next";
import { colombiaDayKey } from "@/lib/colombia-time";
import { formatCop } from "@/modules/expenses/domain/receipt-check";
import { lookupPaymentDraft } from "@/modules/proveedores/application/register-supplier-payment-by-voice";
import { createPrismaSupplierPaymentDeps } from "@/modules/proveedores/infrastructure/prisma-supplier-payment-repository";
import { SoporteForm } from "./soporte-form";

// Enlace secreto para subir la foto del comprobante de un pago a proveedora registrado por Claude.
// Solo muestra la OF, la proveedora, el monto y la fecha; nada mas. Un solo uso, 24 horas.

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ token: string }> };

export const metadata: Metadata = {
  title: "Comprobante del pago",
  robots: { index: false, follow: false },
  // El token no debe salir por Referer hacia otros sitios.
  referrer: "no-referrer",
};

export default async function SupplierPaymentReceiptPage({ params }: PageProps) {
  const { token } = await params;
  let lookup: Awaited<ReturnType<typeof lookupPaymentDraft>>;
  try {
    lookup = await lookupPaymentDraft(createPrismaSupplierPaymentDeps(), token);
  } catch (error) {
    console.error("[pago-proveedora-voz] Fallo al abrir el enlace:", error);
    lookup = { ok: false, reason: "No pudimos abrir el enlace. Intenta de nuevo en un momento." };
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8">
      <div className="mx-auto max-w-md space-y-4">
        <h1 className="text-xl font-semibold text-slate-900">Comprobante del pago a la proveedora</h1>
        {lookup.ok ? (
          <>
            <dl className="space-y-1 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-800">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Orden</dt>
                <dd className="font-medium">{lookup.draft.ofCode ?? "Sin OF"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Proveedora</dt>
                <dd className="text-right font-medium">{lookup.draft.supplierName}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Monto</dt>
                <dd className="font-medium">{formatCop(lookup.draft.amount)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Fecha</dt>
                <dd className="font-medium">{lookup.draft.paymentDate ? colombiaDayKey(lookup.draft.paymentDate) : "—"}</dd>
              </div>
            </dl>
            <p className="text-sm text-slate-600">
              El pago ya quedó guardado. Sube la foto o el PDF del comprobante: JPG, PNG, WEBP o PDF de hasta 12 MB.
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
