import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import { getSystemCurrency } from "@/lib/system-settings";

type PageProps = {
  params: Promise<{ token: string }>;
};

function statusLabel(status: string): string {
  switch (status) {
    case "DRAFT":
      return "Borrador";
    case "SENT":
      return "Enviada";
    case "ACCEPTED":
      return "Aceptada";
    case "REJECTED":
      return "Rechazada";
    case "EXPIRED":
      return "Expirada";
    default:
      return status;
  }
}

export default async function QuotePublicPage({ params }: PageProps) {
  const { token } = await params;

  const [quote, currency] = await Promise.all([
    prisma.quote.findUnique({
      where: { shareToken: token },
      include: {
        client: true,
        createdBy: true,
        items: {
          include: {
            product: true,
            supplier: true,
          },
        },
      },
    }),
    getSystemCurrency(),
  ]);

  if (!quote) {
    notFound();
  }

  return (
    <section className="app-page mx-auto max-w-4xl space-y-4 py-6">
      <Card className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">Cotizacion</p>
            <h1 className="text-2xl font-semibold text-slate-900">{quote.code}</h1>
            <p className="text-sm text-slate-600">
              Cliente: <span className="font-medium text-slate-800">{quote.client.name || quote.client.email}</span>
            </p>
          </div>
          <div className="text-right text-sm text-slate-600">
            <p>
              Estado: <span className="font-medium text-slate-800">{statusLabel(quote.status)}</span>
            </p>
            <p>Fecha: {quote.createdAt.toLocaleDateString("es-CO")}</p>
            {quote.validUntil ? <p>Valida hasta: {quote.validUntil.toLocaleDateString("es-CO")}</p> : null}
          </div>
        </div>

        {quote.notes ? (
          <div className="rounded-lg border border-[var(--line)] bg-slate-50 px-3 py-2 text-sm text-slate-700">
            {quote.notes}
          </div>
        ) : null}
      </Card>

      <Card className="overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2.5 text-left">Producto</th>
              <th className="px-3 py-2.5 text-left">Proveedor</th>
              <th className="px-3 py-2.5 text-left">Cantidad</th>
              <th className="px-3 py-2.5 text-left">Unitario</th>
              <th className="px-3 py-2.5 text-left">Total</th>
            </tr>
          </thead>
          <tbody>
            {quote.items.map((item) => (
              <tr key={item.id} className="border-t border-[var(--line)]">
                <td className="px-3 py-2.5 text-slate-800">{item.product.name}</td>
                <td className="px-3 py-2.5 text-slate-600">{item.supplier?.name || "Sin proveedor"}</td>
                <td className="px-3 py-2.5 text-slate-600">{item.quantity}</td>
                <td className="px-3 py-2.5 text-slate-600">{formatMoney(String(item.unitPrice), currency)}</td>
                <td className="px-3 py-2.5 font-semibold text-[var(--primary-strong)]">
                  {formatMoney(String(item.lineTotal), currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="space-y-1">
        <p className="text-sm text-slate-600">Subtotal: {formatMoney(String(quote.subtotal), currency)}</p>
        <p className="text-xl font-semibold text-slate-900">Total: {formatMoney(String(quote.total), currency)}</p>
        <p className="text-xs text-slate-500">Generada por: {quote.createdBy.name || quote.createdBy.email}</p>
      </Card>
    </section>
  );
}

