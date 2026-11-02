"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Ban } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { adminDeletePurchaseOrderAction } from "@/app/actions/inventory-actions";
import { displayCode } from "@/lib/code-display";

type PurchaseDeleteMenuItemProps = {
  onSelect: () => void;
};

/**
 * Solo el item del menú. El diálogo se renderiza aparte (fuera del
 * DropdownMenu) para evitar que las dos capas modales de Radix se bloqueen
 * mutuamente los eventos de puntero.
 */
export function PurchaseDeleteMenuItem({ onSelect }: PurchaseDeleteMenuItemProps) {
  return (
    <DropdownMenuItem
      onSelect={() => onSelect()}
      className="text-destructive focus:text-destructive"
    >
      <Ban className="mr-2 h-4 w-4" />
      Anular compra
    </DropdownMenuItem>
  );
}

type PurchaseDeleteDialogProps = {
  orderId: string;
  code: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function PurchaseDeleteDialog({ orderId, code, open, onOpenChange }: PurchaseDeleteDialogProps) {
  const router = useRouter();
  const [motivo, setMotivo] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  // Resetea el estado cada vez que se abre el diálogo.
  React.useEffect(() => {
    if (open) {
      setMotivo("");
      setError(null);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Anular la compra {displayCode(code)}</DialogTitle>
          <DialogDescription>
            La compra queda Cancelada con su número. El stock que entró sale con una salida nueva y los
            cobros de la proveedora se anulan. Si ya tiene pagos, primero anula los pagos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <label htmlFor="purchase-void-motivo" className="text-sm font-medium text-foreground">
            Motivo
          </label>
          <Textarea
            id="purchase-void-motivo"
            value={motivo}
            onChange={(event) => setMotivo(event.target.value)}
            minLength={3}
            maxLength={300}
            placeholder="Ej.: la compra quedó repetida"
          />
        </div>

        {error ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Volver
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={pending || motivo.trim().length < 3}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                try {
                  const result = await adminDeletePurchaseOrderAction(orderId, motivo);
                  if (result?.ok) {
                    onOpenChange(false);
                    router.refresh();
                  } else {
                    setError(result?.error ?? "No se pudo anular la compra.");
                  }
                } catch (err) {
                  setError(err instanceof Error ? err.message : "No se pudo anular la compra.");
                }
              });
            }}
          >
            {pending ? "Anulando..." : "Anular compra"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
