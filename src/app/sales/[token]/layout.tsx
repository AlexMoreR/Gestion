import { ReactNode } from "react";

export default function SalePublicLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen w-full bg-background print:bg-white">
      {/* 
        Este contenedor asegura que el contenido ocupe todo el ancho disponible
        sin interferencias de estilos de contenedores superiores.
      */}
      {children}
    </div>
  );
}