"use client";

import { useState } from "react";
import { FileText, Plus } from "lucide-react";
import { QuotesDataTable } from "@/components/admin/quotes-data-table";
import {
  QuoteWizardModal,
  type QuoteWizardClient,
  type QuoteWizardProduct,
} from "@/components/admin/quote-wizard-modal";
import type { SupportedCurrencyCode } from "@/lib/currency";
import { Button } from "../ui/button";

type QuoteRow = {
  id: string;
  code: string;
  clientName: string;
  itemsCount: number;
  total: number;
  status: "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED";
  createdAt: string;
  createdAtISO: string;
  shareToken: string;
  hasSale: boolean;
};

type AccountOption = {
  id: string;
  name: string;
  type: "CASH" | "BANK" | "WALLET" | "OTHER";
};

type QuotesWorkspaceProps = {
  quotes: QuoteRow[];
  clients: QuoteWizardClient[];
  products: QuoteWizardProduct[];
  currency: SupportedCurrencyCode;
  accounts: AccountOption[];
};

export function QuotesWorkspace({ quotes, clients, products, currency, accounts }: QuotesWorkspaceProps) {
  const [openModal, setOpenModal] = useState(false);

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="inline-flex items-center gap-1 text-lg font-semibold tracking-tight text-foreground md:text-xl">
            <FileText className="h-4 w-4 text-primary" />
            <span>Cotizaciones</span>
          </h1>
        </div>
        <Button type="button" onClick={() => setOpenModal(true)}>
          <Plus className="h-4 w-4" />
          Nueva cotizacion
        </Button>
      </div>

      <QuotesDataTable quotes={quotes} currency={currency} accounts={accounts} />

      <QuoteWizardModal
        open={openModal}
        onClose={() => setOpenModal(false)}
        mode="create"
        currency={currency}
        clients={clients}
        products={products}
        returnTo="/admin/cotizaciones"
      />
    </>
  );
}
