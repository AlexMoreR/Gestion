"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { adminChangeOrderItemImageAction } from "@/app/actions/orders-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OF_IMAGE_MAX_BYTES, validarArchivoImagenOF } from "@/lib/of-image";

function SaveButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" name="accion" value="guardar" className="w-full" disabled={pending || disabled}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {pending ? "Guardando..." : "Guardar imagen"}
    </Button>
  );
}

// Cambia solo la imagen que ve la proveedora en este producto de la OF. El archivo se escoge o se pega
// del portapapeles; la vista previa muestra lo que se va a guardar.
export function ChangeItemImageDialog({
  open,
  onOpenChange,
  orderItemId,
  productName,
  imagenActual,
  imagenManual,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderItemId: string;
  productName: string;
  /** Imagen que se ve hoy (la manual o la del catálogo); null si no hay. */
  imagenActual: string | null;
  /** La subida a mano (null = usa la del catálogo). */
  imagenManual: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [vista, setVista] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    return () => {
      if (vista) URL.revokeObjectURL(vista);
    };
  }, [vista]);

  const elegir = (file: File | null) => {
    if (!file) return;
    const valida = validarArchivoImagenOF(file);
    if (!valida.ok) {
      setError(valida.error);
      return;
    }
    setError("");
    setArchivo(file);
    setVista(URL.createObjectURL(file));
    // El archivo pegado no pasa por el input: se le pone al input para que viaje en el formulario.
    if (inputRef.current) {
      const dt = new DataTransfer();
      dt.items.add(file);
      inputRef.current.files = dt.files;
    }
  };

  const alPegar = (event: React.ClipboardEvent) => {
    const imagen = [...event.clipboardData.files].find((f) => f.type.startsWith("image/"));
    if (!imagen) return;
    event.preventDefault();
    elegir(imagen);
  };

  const mostrada = vista ?? imagenActual;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-lg overflow-y-auto" onPaste={alPegar}>
        <DialogHeader>
          <DialogTitle>Cambiar imagen</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{productName}</span>. La proveedora verá esta imagen en su OF.
            Solo cambia este producto en esta orden: el catálogo, los precios y los pagos no cambian.
          </DialogDescription>
        </DialogHeader>

        <form action={adminChangeOrderItemImageAction} className="space-y-3">
          <input type="hidden" name="orderItemId" value={orderItemId} />
          <div className="space-y-1.5">
            <span className="text-sm font-medium text-foreground">
              {vista ? "Imagen nueva" : imagenManual ? "Imagen actual (subida a mano)" : "Imagen actual (del catálogo)"}
            </span>
            {mostrada ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mostrada} alt={productName} className="max-h-72 w-full rounded-lg border object-contain" />
            ) : (
              <p className="text-xs text-muted-foreground">Este producto no tiene imagen.</p>
            )}
          </div>
          <div className="space-y-1.5">
            <input
              ref={inputRef}
              type="file"
              name="imagen"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => elegir(event.target.files?.[0] ?? null)}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-muted file:px-3 file:py-1.5 file:text-sm"
            />
            <p className="text-xs text-muted-foreground">
              JPG, PNG o WEBP de hasta {OF_IMAGE_MAX_BYTES / (1024 * 1024)} MB. También puedes pegarla con Ctrl+V.
            </p>
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
          </div>
          <SaveButton disabled={!archivo} />
          {imagenManual ? (
            <Button type="submit" name="accion" value="restaurar" variant="outline" className="w-full">
              Volver a la imagen del catálogo
            </Button>
          ) : null}
        </form>
      </DialogContent>
    </Dialog>
  );
}
