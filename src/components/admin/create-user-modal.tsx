"use client";

import { adminCreateUserAction } from "@/app/actions/auth-actions";
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

export function CreateUserModal() {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button className="bg-[var(--primary)] text-white hover:bg-[var(--primary-strong)]">
            Crear usuario
          </Button>
        }
      />

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Crear usuario</DialogTitle>
          <DialogDescription>
            Crea una cuenta para el equipo del sistema (admins y empleados).
          </DialogDescription>
        </DialogHeader>

        <form action={adminCreateUserAction} className="space-y-3">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-foreground">Nombre</span>
            <Input type="text" name="name" placeholder="Nombre completo" required />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-foreground">Correo</span>
            <Input type="email" name="email" placeholder="correo@empresa.com" required />
          </label>
          <p className="text-xs text-muted-foreground">
            Se enviara un correo de invitacion para que la persona cree su propia contrasena.
          </p>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-foreground">Rol</span>
            <select name="role" defaultValue="EMPLEADO" className="field-select">
              <option value="ADMIN">ADMIN</option>
              <option value="EMPLEADO">EMPLEADO</option>
            </select>
          </label>
          <Button
            type="submit"
            className="w-full bg-[var(--primary)] text-white hover:bg-[var(--primary-strong)]"
          >
            Enviar invitacion
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
