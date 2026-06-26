"use client";

import { useState } from "react";
import { CalendarDays, ClipboardList, Package, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoney } from "@/lib/currency";

export type SupplierBalanceRow = {
  id: string;
  orderCode: string;
  productName: string;
  productCode: string | null;
  productImage: string | null;
  quantity: number;
  amount: number;
  isPaid: boolean;
  isFinished: boolean;
  date: string;
  receiptUrl: string | null;
};

type SupplierBalanceItemsProps = {
  rows: SupplierBalanceRow[];
  currency: Parameters<typeof formatMoney>[1];
  emptyLabel: string;
  header: { fecha: string; orden: string; producto: string; precio: string; estado: string; pago: string };
};

function StateBadge({ isFinished }: { isFinished: boolean }) {
  return (
    <Badge
      variant="outline"
      className={
        isFinished
          ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-600"
          : "border-amber-500/30 bg-amber-500/15 text-amber-600"
      }
    >
      {isFinished ? "Terminado" : "En fabricacion"}
    </Badge>
  );
}

function PaymentBadge({ isPaid }: { isPaid: boolean }) {
  return (
    <Badge
      variant="outline"
      className={
        isPaid
          ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-600"
          : "border-border bg-muted text-muted-foreground"
      }
    >
      {isPaid ? "Pagado" : "Pendiente"}
    </Badge>
  );
}

export function SupplierBalanceItems({ rows, currency, emptyLabel, header }: SupplierBalanceItemsProps) {
  const [selected, setSelected] = useState<SupplierBalanceRow | null>(null);

  return (
    <>
      <div className="hidden overflow-x-auto rounded-xl border border-border bg-card md:block">
        <Table className="min-w-[760px] [&_td]:px-2 [&_td]:py-1.5 [&_th]:px-2">
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="w-px whitespace-nowrap">
                <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />{header.fecha}</span>
              </TableHead>
              <TableHead className="w-px whitespace-nowrap">
                <span className="inline-flex items-center gap-1.5"><ClipboardList className="h-3.5 w-3.5 text-muted-foreground" />{header.orden}</span>
              </TableHead>
              <TableHead>
                <span className="inline-flex items-center gap-1.5"><Package className="h-3.5 w-3.5 text-muted-foreground" />{header.producto}</span>
              </TableHead>
              <TableHead>
                <span className="inline-flex items-center gap-1.5"><Tag className="h-3.5 w-3.5 text-muted-foreground" />{header.precio}</span>
              </TableHead>
              <TableHead>{header.estado}</TableHead>
              <TableHead>{header.pago}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-9 text-center text-muted-foreground">
                  {emptyLabel}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow
                  key={row.id}
                  onClick={() => setSelected(row)}
                  className="cursor-pointer"
                >
                  <TableCell className="w-px whitespace-nowrap text-xs text-muted-foreground">{row.date}</TableCell>
                  <TableCell className="w-px whitespace-nowrap text-sm font-semibold text-foreground">{row.orderCode}</TableCell>
                  <TableCell className="text-sm text-foreground">
                    <div className="flex items-stretch gap-2">
                      <div className="-my-1.5 flex w-10 shrink-0 items-center justify-center self-stretch overflow-hidden border-r border-border bg-muted/40">
                        {row.productImage ? (
                          <img src={row.productImage} alt={row.productName} className="h-full w-full object-cover" />
                        ) : (
                          <Package className="h-5 w-5 text-muted-foreground/50" />
                        )}
                      </div>
                      <div className="min-w-0 self-center leading-tight">
                        <p className="truncate">{row.productName}</p>
                        {row.productCode ? (
                          <p className="text-[12px] text-muted-foreground">{row.productCode}</p>
                        ) : null}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm font-semibold text-foreground">{formatMoney(row.amount, currency)}</TableCell>
                  <TableCell><StateBadge isFinished={row.isFinished} /></TableCell>
                  <TableCell><PaymentBadge isPaid={row.isPaid} /></TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Vista movil en tarjetas */}
      <div className="space-y-2 md:hidden">
        {rows.length === 0 ? (
          <div className="rounded-xl border border-border bg-card px-3 py-6 text-center text-sm text-muted-foreground">
            {emptyLabel}
          </div>
        ) : (
          rows.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => setSelected(row)}
              className="w-full space-y-2 rounded-xl border border-border bg-card p-3 text-left"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/40">
                  {row.productImage ? (
                    <img src={row.productImage} alt={row.productName} className="h-full w-full object-cover" />
                  ) : (
                    <Package className="h-6 w-6 text-muted-foreground/50" />
                  )}
                </div>
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="truncate text-sm font-medium text-foreground">{row.productName}</p>
                  {row.productCode ? (
                    <p className="text-[12px] text-muted-foreground">{row.productCode}</p>
                  ) : null}
                </div>
                <p className="shrink-0 text-sm font-semibold text-foreground">{formatMoney(row.amount, currency)}</p>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  {row.orderCode} · {row.date}
                </span>
                <div className="flex items-center gap-1.5">
                  <StateBadge isFinished={row.isFinished} />
                  <PaymentBadge isPaid={row.isPaid} />
                </div>
              </div>
            </button>
          ))
        )}
      </div>

      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-md">
          {selected ? (
            <>
              <DialogHeader>
                <DialogTitle>{selected.productName}</DialogTitle>
              </DialogHeader>
              <dl className="space-y-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">{header.fecha}</dt>
                  <dd className="font-medium text-foreground">{selected.date}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">{header.orden}</dt>
                  <dd className="font-medium text-foreground">{selected.orderCode}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">{header.producto}</dt>
                  <dd className="text-right font-medium text-foreground">
                    {selected.productName}
                    {selected.productCode ? (
                      <span className="block text-[12px] font-normal text-muted-foreground">{selected.productCode}</span>
                    ) : null}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">{header.precio}</dt>
                  <dd className="font-semibold text-foreground">{formatMoney(selected.amount, currency)}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">{header.estado}</dt>
                  <dd className="flex items-center gap-1.5">
                    <StateBadge isFinished={selected.isFinished} />
                    <PaymentBadge isPaid={selected.isPaid} />
                  </dd>
                </div>
              </dl>

              {selected.isPaid ? (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Comprobante</p>
                  {selected.receiptUrl ? (
                    <a href={selected.receiptUrl} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg border border-border">
                      <img src={selected.receiptUrl} alt="Comprobante de pago" className="max-h-80 w-full object-contain bg-muted/30" />
                    </a>
                  ) : (
                    <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                      Sin comprobante adjunto.
                    </p>
                  )}
                </div>
              ) : null}
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
