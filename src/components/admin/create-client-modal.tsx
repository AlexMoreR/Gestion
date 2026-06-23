"use client";

import { adminCreateClientQuickAction } from "@/app/actions/quote-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export function CreateClientModal() {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button className="bg-[var(--primary)] text-white hover:bg-[var(--primary-strong)]">
            Crear cliente
          </Button>
        }
      />

      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Crear cliente</DialogTitle>
          <DialogDescription>
            Registra un cliente manualmente en el directorio.
          </DialogDescription>
        </DialogHeader>

        <form action={adminCreateClientQuickAction} className="space-y-3">
          <input type="hidden" name="returnTo" value="/admin/clientes" />

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-foreground">Nombre</span>
              <Input type="text" name="name" placeholder="Nombre completo" required />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-foreground">Documento</span>
              <Input type="text" name="document" placeholder="Cedula / NIT (opcional)" />
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-foreground">Correo</span>
              <Input type="email" name="email" placeholder="correo@ejemplo.com (opcional)" />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-foreground">Telefono</span>
              <Input type="text" name="phone" placeholder="Numero de contacto" required />
            </label>
          </div>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-foreground">Direccion</span>
            <Input type="text" name="address" placeholder="Direccion" required />
          </label>

          <div className="grid gap-3 md:grid-cols-3">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-foreground">Barrio</span>
              <Input type="text" name="neighborhood" placeholder="Opcional" />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-foreground">Departamento</span>
              <Input type="text" name="department" placeholder="Opcional" />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-foreground">Ciudad</span>
              <Input type="text" name="city" placeholder="Ciudad" required />
            </label>
          </div>

          <Button
            type="submit"
            className="w-full bg-[var(--primary)] text-white hover:bg-[var(--primary-strong)]"
          >
            Guardar cliente
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
