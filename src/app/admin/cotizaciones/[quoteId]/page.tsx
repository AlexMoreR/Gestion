import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { adminUpdateQuoteMetaAction } from "@/app/actions/quote-actions";
import { Input } from "@/components/ui/input";
import { prisma } from "@/lib/prisma";

type PageProps = {
  params: Promise<{ quoteId: string }>;
};

export default async function AdminCotizacionDetallePage({ params }: PageProps) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    redirect("/unauthorized");
  }

  const { quoteId } = await params;

  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: {
      client: true,
      items: {
        include: {
          product: true,
          supplier: true,
        },
      },
    },
  });

  if (!quote) {
    notFound();
  }

  const validUntilValue = quote.validUntil
    ? new Date(quote.validUntil.getTime() - quote.validUntil.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 10)
    : "";

  return (
    <section className="w-full space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Editar cotizacion {quote.code}</h1>
          <p className="text-sm text-slate-600">
            Cliente: {quote.client.name || quote.client.email}
          </p>
        </div>
        <Link
          href="/admin/cotizaciones"
          className="inline-flex h-9 items-center justify-center rounded-lg border border-[var(--line)] px-3 text-sm text-slate-700 transition hover:bg-slate-50"
        >
          Volver
        </Link>
      </div>

      <form action={adminUpdateQuoteMetaAction} className="space-y-4 rounded-xl border border-[var(--line)] bg-white p-4">
        <input type="hidden" name="quoteId" value={quote.id} />
        <input type="hidden" name="returnTo" value="/admin/cotizaciones" />

        <div className="grid gap-3 md:grid-cols-3">
          <label className="space-y-1.5">
            <span className="text-sm font-medium text-slate-700">Estado</span>
            <select
              name="status"
              defaultValue={quote.status}
              className="field-select"
            >
              <option value="DRAFT">Borrador</option>
              <option value="SENT">Enviada</option>
              <option value="ACCEPTED">Aceptada</option>
              <option value="REJECTED">Rechazada</option>
              <option value="EXPIRED">Expirada</option>
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium text-slate-700">Valida hasta</span>
            <Input name="validUntil" type="date" defaultValue={validUntilValue} />
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium text-slate-700">Total</span>
            <Input
              value={quote.total.toNumber().toLocaleString("es-CO", {
                style: "currency",
                currency: "COP",
              })}
              readOnly
            />
          </label>
        </div>

        <label className="space-y-1.5 block">
          <span className="text-sm font-medium text-slate-700">Notas</span>
          <textarea
            name="notes"
            defaultValue={quote.notes ?? ""}
            rows={4}
            className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-[var(--line-strong)]"
            placeholder="Observaciones de la cotizacion"
          />
        </label>

        <div className="flex justify-end">
          <button
            type="submit"
            className="inline-flex h-10 items-center justify-center rounded-lg bg-[var(--primary)] px-4 text-sm font-medium text-white transition hover:bg-[var(--primary-strong)]"
          >
            Guardar cambios
          </button>
        </div>
      </form>

      <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50/70 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2.5 text-left">Producto</th>
              <th className="px-3 py-2.5 text-left">Proveedor</th>
              <th className="px-3 py-2.5 text-left">Cantidad</th>
              <th className="px-3 py-2.5 text-left">Precio unitario</th>
              <th className="px-3 py-2.5 text-left">Total</th>
            </tr>
          </thead>
          <tbody>
            {quote.items.map((item) => (
              <tr key={item.id} className="border-t border-[var(--line)]">
                <td className="px-3 py-2.5 text-slate-800">{item.product.name}</td>
                <td className="px-3 py-2.5 text-slate-700">{item.supplier?.name ?? "Sin proveedor"}</td>
                <td className="px-3 py-2.5 text-slate-700">{item.quantity}</td>
                <td className="px-3 py-2.5 text-slate-700">
                  {item.unitPrice.toNumber().toLocaleString("es-CO", {
                    style: "currency",
                    currency: "COP",
                  })}
                </td>
                <td className="px-3 py-2.5 font-medium text-slate-800">
                  {item.lineTotal.toNumber().toLocaleString("es-CO", {
                    style: "currency",
                    currency: "COP",
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
