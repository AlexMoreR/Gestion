"use client";

import { useActionState, useEffect } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { registerAction } from "@/app/actions/auth-actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ActionState } from "@/lib/validations/auth";

const initialState: ActionState = { ok: false, message: "" };

export function RegisterForm() {
  const [state, formAction, pending] = useActionState(registerAction, initialState);

  useEffect(() => {
    if (!state.message) return;
    if (state.ok) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);

  return (
    <Card className="w-full max-w-sm p-6">
      <div className="mb-6 space-y-1.5">
        <h1 className="text-2xl font-semibold text-slate-900">Crear cuenta</h1>
      </div>
      <form action={formAction} className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700">Nombre</span>
          <Input type="text" name="name" placeholder="Nombre completo" required />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700">Correo</span>
          <Input type="email" name="email" placeholder="correo@empresa.com" required />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700">Contrasena</span>
          <Input type="password" name="password" placeholder="Crea una contrasena segura" required />
        </label>

        <Button type="submit" className="mt-2 w-full" disabled={pending}>
          {pending ? "Creando..." : "Registrarme"}
        </Button>
      </form>
      <p className="mt-5 text-center text-sm text-slate-600">
        Ya tienes cuenta?{" "}
        <Link href="/login" className="font-semibold text-[var(--primary)] hover:text-[var(--primary-strong)]">
          Inicia sesion
        </Link>
      </p>
    </Card>
  );
}
