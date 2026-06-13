import { ReactNode } from "react";

export default function QuotePublicLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen w-full bg-background print:min-h-0 print:bg-white">
      {/* 
        Layout simplificado para visualización pública y generación de PDF
        removiendo cualquier rastro de la interfaz administrativa.
      */}
      {children}
    </div>
  );
}