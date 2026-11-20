import Link from "next/link";
import { CalendarClock, HandCoins } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { displayCode } from "@/lib/code-display";
import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";
import type { PayableRow, SupplierPayables } from "@/lib/supplier-payables";

type Props = {
  payables: SupplierPayables;
  currency: SupportedCurrencyCode;
};

function PayablesTable({ rows, currency }: { rows: PayableRow[]; currency: SupportedCurrencyCode }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Proveedora</TableHead>
          <TableHead>OF</TableHead>
          <TableHead>Orden/Venta</TableHead>
          <TableHead>Productos</TableHead>
          <TableHead className="text-right">Costo</TableHead>
          <TableHead className="text-right">Pagado</TableHead>
          <TableHead className="text-right">Falta</TableHead>
          <TableHead>Por qué</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.target}>
            <TableCell className="whitespace-nowrap font-medium">{row.supplierName}</TableCell>
            <TableCell className="whitespace-nowrap">{row.manufacturingCode ? displayCode(row.manufacturingCode) : "—"}</TableCell>
            <TableCell className="whitespace-nowrap">
              <span className="block">{row.orderCode ? displayCode(row.orderCode) : "—"}</span>
              {row.saleCode ? <span className="block text-xs text-muted-foreground">{displayCode(row.saleCode)}</span> : null}
              {row.clientName ? <span className="block text-xs text-muted-foreground">{row.clientName}</span> : null}
            </TableCell>
            <TableCell className="min-w-48 text-xs">{row.products.length ? row.products.join(", ") : "—"}</TableCell>
            <TableCell className="whitespace-nowrap text-right">{formatMoney(row.cost, currency)}</TableCell>
            <TableCell className="whitespace-nowrap text-right">{formatMoney(row.paid, currency)}</TableCell>
            <TableCell className="whitespace-nowrap text-right font-semibold">{formatMoney(row.pending, currency)}</TableCell>
            <TableCell className="min-w-40 text-xs">{row.reason}</TableCell>
            <TableCell>
              <Link
                href={`/admin/proveedores/${row.supplierId}/cuenta?pagar=${encodeURIComponent(row.target)}`}
                className={`${buttonVariants({ variant: "outline", size: "sm" })} whitespace-nowrap`}
              >
                Registrar pago
              </Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// Solo muestra: no manda WhatsApp, correo ni avisos. El pago se registra en la cuenta de la proveedora.
export function SupplierPayablesSection({ payables, currency }: Props) {
  const withToday = payables.suppliers.filter((s) => s.today > 0.0001);
  const withFavor = payables.suppliers.filter((s) => Math.abs(s.inFavor) > 0.5);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="inline-flex items-center gap-2 text-base">
            <HandCoins className="h-4 w-4 text-primary" />
            Por pagar hoy
          </CardTitle>
          <CardDescription>
            50/50 y pago total: apenas se confirma la OF. Contraentrega: cuando la orden queda entregada. Compras: lo que falte.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {payables.today.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay nada por pagar hoy.</p>
          ) : (
            <PayablesTable rows={payables.today} currency={currency} />
          )}
          <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2.5">
            <ul className="space-y-0.5 text-xs text-muted-foreground">
              {withToday.map((s) => (
                <li key={s.supplierId}>
                  {s.name}: <span className="font-semibold text-foreground">{formatMoney(s.today, currency)}</span>
                </li>
              ))}
              {withFavor.map((s) => (
                <li key={`favor-${s.supplierId}`}>
                  {s.name}: abonos sin orden o pagados de más {formatMoney(s.inFavor, currency)} (saldo {formatMoney(s.balance, currency)})
                </li>
              ))}
            </ul>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Total a pagar hoy</p>
              <p className="text-lg font-bold tracking-tight text-primary">{formatMoney(payables.totalToday, currency)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="inline-flex items-center gap-2 text-base">
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
            Próximos
          </CardTitle>
          <CardDescription>Lo que todavía no toca pagar.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {payables.upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay pagos próximos.</p>
          ) : (
            <PayablesTable rows={payables.upcoming} currency={currency} />
          )}
          <div className="flex justify-end">
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Total próximos</p>
              <p className="text-base font-semibold text-foreground">{formatMoney(payables.totalUpcoming, currency)}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
