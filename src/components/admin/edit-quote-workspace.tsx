"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  QuoteWizardModal,
  type QuoteWizardClient,
  type QuoteWizardProduct,
  type QuoteWizardInitialLine,
  type QuoteStatus,
} from "@/components/admin/quote-wizard-modal";
import type { SupportedCurrencyCode } from "@/lib/currency";

type EditQuoteData = {
  id: string;
  code: string;
  status: QuoteStatus;
  validUntil: string;
  createdAt: string;
  notes: string;
  client: QuoteWizardClient;
  items: QuoteWizardInitialLine[];
};

type EditQuoteWorkspaceProps = {
  quote: EditQuoteData;
  clients: QuoteWizardClient[];
  products: QuoteWizardProduct[];
  currency: SupportedCurrencyCode;
};

export function EditQuoteWorkspace({ quote, clients, products, currency }: EditQuoteWorkspaceProps) {
  const router = useRouter();
  const [open, setOpen] = useState(true);

  const close = () => {
    setOpen(false);
    // Al cerrar el modal de edicion volvemos al listado de cotizaciones.
    router.push("/admin/cotizaciones");
  };

  return (
    <QuoteWizardModal
      open={open}
      onClose={close}
      mode="edit"
      currency={currency}
      clients={clients}
      products={products}
      returnTo="/admin/cotizaciones"
      quoteId={quote.id}
      quoteCode={quote.code}
      initialClient={quote.client}
      initialLines={quote.items}
      initialCreatedAt={quote.createdAt}
      initialStatus={quote.status}
      initialValidUntil={quote.validUntil}
      initialNotes={quote.notes}
    />
  );
}
