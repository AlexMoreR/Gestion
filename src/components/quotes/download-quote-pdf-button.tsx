"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "../ui/button";

type DownloadQuotePdfButtonProps = {
  className?: string;
  quoteToken: string;
};

export function DownloadQuotePdfButton({ className, quoteToken }: DownloadQuotePdfButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleDownloadPdf = async () => {
    setIsGenerating(true);
    try {
      // Llama a tu ruta API para generar el PDF
      // const response = await fetch(`/api/generate-quote-pdf?token=${quoteToken}`);
      // if (!response.ok) {
      //   throw new Error("Failed to generate PDF");
      // }

      const response = await fetch(`/api/generate-quote-pdf?token=${quoteToken}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("API Error:", response.status, errorText);
        throw new Error(`Failed to generate PDF (${response.status})`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cotizacion-${quoteToken}.pdf`; // Nombre de archivo dinámico
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error generating PDF:", error);
      // Opcionalmente, mostrar un mensaje de error al usuario
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Button
      type="button"
      onClick={handleDownloadPdf}
      disabled={isGenerating}
      className={className}
    >
      <Download className="h-4 w-4" />
      {isGenerating ? "Generando PDF..." : "Descargar PDF"}
    </Button>
  );
}
