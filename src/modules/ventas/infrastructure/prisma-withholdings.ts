import { dbWindow } from "@/lib/colombia-time";
import { prisma } from "@/lib/prisma";

import {
  buildWithholdingReport,
  withholdingRowDate,
  withholdingYearRange,
  type WithholdingReport,
  type WithholdingRow,
} from "../domain/withholding";

// Retenciones en la fuente del año del mes pedido (AAAA-MM). El filtro por mes y los totales
// los hace la regla pura (buildWithholdingReport), en hora de Colombia.
export async function getWithholdingReport(month: string): Promise<WithholdingReport> {
  const createdAtRange = withholdingYearRange(month);
  // Fecha escrita (medianoche UTC): ventana 5 h antes; el filtro fino lo hace buildWithholdingReport.
  const window = dbWindow({ start: createdAtRange.from, end: createdAtRange.to });
  const payments = await prisma.salePayment.findMany({
    where: {
      isWithholding: true,
      OR: [
        { paymentDate: { gte: window.start, lt: window.end } },
        // Abono sin fecha escrita: cuenta el dia (en Colombia) en que se registro.
        { paymentDate: null, createdAt: { gte: createdAtRange.from, lt: createdAtRange.to } },
      ],
    },
    orderBy: [{ paymentDate: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      amount: true,
      paymentDate: true,
      createdAt: true,
      withholdingCertificate: true,
      sale: {
        select: {
          code: true,
          client: { select: { name: true, email: true, document: true } },
        },
      },
    },
  });

  const rows: WithholdingRow[] = payments.map((payment) => ({
    id: payment.id,
    date: withholdingRowDate(payment.paymentDate, payment.createdAt),
    saleCode: payment.sale.code,
    clientName: payment.sale.client?.name?.trim() || payment.sale.client?.email || "Sin nombre",
    clientTaxId: payment.sale.client?.document?.trim() || null,
    amount: Number(payment.amount),
    certificate: payment.withholdingCertificate,
  }));

  return buildWithholdingReport(month, rows);
}
