"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { adminFichasDeProductoAction } from "@/app/actions/product-ficha-actions";
import { ProductFichaTecnica } from "@/components/store/product-ficha-tecnica";
import { altFicha } from "@/lib/product-fichas";

// La ficha publica se arma igual para todos (sin leer la sesion en el servidor): lo del admin
// se decide aqui, en el navegador. Crear/borrar resenas y ver fichas se validan en el servidor.
function useEsAdmin(): boolean {
  const { data: session } = useSession();
  return session?.user?.role === "ADMIN";
}

export function SoloAdmin({ children }: { children: ReactNode }) {
  return useEsAdmin() ? <>{children}</> : null;
}

// Las URLs de las fichas no van en el HTML publico (marca de agua del proveedor): se piden aparte.
export function FichasAdmin({ productId, displayName }: { productId: string; displayName: string }) {
  const esAdmin = useEsAdmin();
  const [fichas, setFichas] = useState<Array<{ id: string; url: string }>>([]);

  useEffect(() => {
    if (!esAdmin) return;
    let vigente = true;
    adminFichasDeProductoAction(productId)
      .then((lista) => {
        if (vigente) setFichas(lista);
      })
      .catch(() => {
        // Sin fichas si falla: la pagina sigue igual para el admin.
      });
    return () => {
      vigente = false;
    };
  }, [esAdmin, productId]);

  if (!esAdmin || fichas.length === 0) return null;

  return (
    <div className="mt-5">
      <h3 id="ficha-tecnica" className="mb-2.5 text-[17px] font-bold tracking-tight text-foreground">
        Ficha técnica
      </h3>
      <ProductFichaTecnica
        fichas={fichas.map((ficha, index) => ({
          id: ficha.id,
          src: ficha.url,
          alt: altFicha(displayName, index, fichas.length),
        }))}
      />
    </div>
  );
}
