"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type DownloadSaleInvoicePdfButtonProps = {
  className?: string;
  invoiceToken: string;
};

export function DownloadSaleInvoicePdfButton({ className, invoiceToken }: DownloadSaleInvoicePdfButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleDownloadPdf = async () => {
    setIsGenerating(true);

    try {
      await toast.promise(
        (async () => {
          const response = await fetch(`/api/generate-sale-invoice-pdf?token=${invoiceToken}`);

          if (!response.ok) {
            const errorText = await response.text();
            console.error("API Error:", response.status, errorText);
            throw new Error(`Failed to generate PDF (${response.status})`);
          }

          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `invoice-${invoiceToken}.pdf`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          window.URL.revokeObjectURL(url);
        })(),
        {
          loading: "Generating invoice PDF...",
          success: "Invoice PDF ready",
          error: "Could not generate invoice PDF",
        },
      );
    } catch (error) {
      console.error("Error generating invoice PDF:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button type="button" onClick={handleDownloadPdf} disabled={isGenerating} className={className}>
      <Download className="h-4 w-4" />
      {isGenerating ? "Generating..." : "Download PDF"}
      </Button>
      {isGenerating ? (
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full w-2/3 animate-pulse rounded-full bg-primary" />
        </div>
      ) : null}
    </div>
  );
}
