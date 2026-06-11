"use client";

import { BadgeDollarSign } from "lucide-react";
import { SalesDataTable } from "@/components/admin/sales-data-table";
import { Card, CardContent } from "@/components/ui/card";
import type { SupportedCurrencyCode } from "@/lib/currency";

type SaleRow = {
  id: string;
  code: string;
  quoteCode: string;
  clientName: string;
  total: number;
  status: "DRAFT" | "ACTIVE" | "INVOICED" | "COMPLETED" | "CANCELLED";
  createdAt: string;
  invoiceToken: string;
  paymentReceiptUrl: string;
  paymentReceiptType: string;
};

type SalesWorkspaceProps = {
  sales: SaleRow[];
  currency: SupportedCurrencyCode;
};

export function SalesWorkspace({ sales, currency }: SalesWorkspaceProps) {
  return (
    <section className="space-y-4">
      <Card className="border border-border bg-card/95">
        <CardContent className="space-y-2">

          <div className="flex flex-row items-center gap-1">
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--primary)_12%,white)] text-primary">
              <BadgeDollarSign className="h-5 w-5" />
            </div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground md:text-xl">Ventas</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Revise los presupuestos convertidos, abra la factura o descargue la versión en PDF.
          </p>
        </CardContent>
      </Card>

      <SalesDataTable sales={sales} currency={currency} />
    </section>
  );
}
