"use client";

import { useState } from "react";
import Image from "next/image";
import { MessageCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  etiquetaColor,
  mensajeWhatsAppColor,
  type ColorCarta,
  type GrupoCartaPublica,
} from "@/modules/colores/domain/carta-colores";

type Elegido = { material: { nombre: string }; color: ColorCarta };

// Las dos pestañas siempre se muestran; si un grupo no tiene materiales visibles sale el aviso "Pronto…".
const PESTANAS = [
  { grupo: "CUERO", titulo: "Cueros" },
  { grupo: "TELA", titulo: "Telas" },
] as const;

function Muestra({ color, etiqueta, sizes }: { color: ColorCarta; etiqueta: string; sizes: string }) {
  if (color.fotoUrl) {
    return <Image src={color.fotoUrl} alt={etiqueta} fill sizes={sizes} className="object-cover" loading="lazy" unoptimized />;
  }
  return <div className="h-full w-full" style={{ backgroundColor: color.hex ?? "#e2e8f0" }} aria-hidden />;
}

function Pronto({ nombre }: { nombre: string }) {
  return (
    <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
      Pronto verás aquí los colores de {nombre}
    </p>
  );
}

export function CartaColores({ grupos, whatsAppPhone }: { grupos: GrupoCartaPublica[]; whatsAppPhone: string }) {
  const [elegido, setElegido] = useState<Elegido | null>(null);
  const etiquetaElegido = elegido ? etiquetaColor(elegido.material, elegido.color) : "";

  return (
    <>
      <Tabs defaultValue="CUERO" className="gap-4">
        <TabsList className="w-full sm:w-auto sm:self-start">
          {PESTANAS.map((p) => (
            <TabsTrigger key={p.grupo} value={p.grupo} className="flex-1 sm:flex-none">
              {p.titulo}
            </TabsTrigger>
          ))}
        </TabsList>

        {PESTANAS.map((p) => {
          const materiales = grupos.find((g) => g.grupo === p.grupo)?.materiales ?? [];
          return (
            <TabsContent key={p.grupo} value={p.grupo} className="space-y-8">
              {materiales.length === 0 ? <Pronto nombre={p.titulo} /> : null}
              {materiales.map((material) => (
                <section key={material.id} aria-labelledby={`material-${material.id}`}>
                  <h2 id={`material-${material.id}`} className="mb-3 text-lg font-bold tracking-tight text-slate-900">
                    {material.nombre}
                  </h2>
                  {material.colores.length === 0 ? (
                    <Pronto nombre={material.nombre} />
                  ) : (
                    <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                      {material.colores.map((color) => {
                        const etiqueta = etiquetaColor(material, color);
                        return (
                          <li key={color.id}>
                            <button
                              type="button"
                              aria-label={etiqueta}
                              onClick={() => setElegido({ material, color })}
                              className="group block w-full text-left outline-none"
                            >
                              <span className="relative block aspect-square overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition group-hover:shadow-md group-focus-visible:ring-2 group-focus-visible:ring-slate-900">
                                <Muestra color={color} etiqueta={etiqueta} sizes="(min-width: 1024px) 16vw, (min-width: 640px) 25vw, 33vw" />
                              </span>
                              <span className="mt-1.5 block text-xs leading-tight font-medium break-words text-slate-700">
                                {etiqueta}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              ))}
            </TabsContent>
          );
        })}
      </Tabs>

      <Dialog open={elegido !== null} onOpenChange={(open) => !open && setElegido(null)}>
        <DialogContent className="max-w-sm bg-white">
          {elegido ? (
            <>
              <DialogHeader>
                <DialogTitle className="pr-8 text-lg font-bold text-slate-900">{etiquetaElegido}</DialogTitle>
                <DialogDescription>Escríbenos por WhatsApp y te ayudamos con tu pedido en este color.</DialogDescription>
              </DialogHeader>
              <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-slate-200">
                <Muestra color={elegido.color} etiqueta={etiquetaElegido} sizes="384px" />
              </div>
              <a
                href={`https://wa.me/${whatsAppPhone}?text=${encodeURIComponent(mensajeWhatsAppColor(elegido.material, elegido.color))}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-base font-semibold text-white transition-colors hover:bg-emerald-700"
              >
                <MessageCircle className="h-5 w-5" />
                Quiero este color
              </a>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
