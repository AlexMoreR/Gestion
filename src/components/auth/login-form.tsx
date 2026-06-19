"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { toast } from "react-toastify";
import { loginAction } from "@/app/actions/auth-actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ActionState } from "@/lib/validations/auth";

const initialState: ActionState = { ok: false, message: "" };

export function LoginForm() {
  const router = useRouter();
  const [state, setState] = useState(initialState);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!state.message) return;
    if (state.ok) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const nextState = await loginAction(formData);
      setState(nextState);

      if (!nextState.ok) return;

      const email = formData.get("email");
      const password = formData.get("password");

      const result = await signIn("credentials", {
        email: typeof email === "string" ? email : "",
        password: typeof password === "string" ? password : "",
        redirect: false,
      });

      if (result?.error) {
        setState({ ok: false, message: "No se pudo iniciar sesion" });
        return;
      }

      router.replace(nextState.redirectTo || "/");
      router.refresh();
    });
  }

  return (
    <Card className="w-full max-w-sm space-y-1 p-6">
      <div className="mb-6 space-y-1.5">
        <h1 className="text-2xl font-semibold text-slate-900">Iniciar sesion</h1>
      </div>
      <form action={handleSubmit} className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700">Correo</span>
          <Input type="email" name="email" placeholder="correo@empresa.com" required />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700">Contrasena</span>
          <Input type="password" name="password" placeholder="Tu contrasena" required />
        </label>
        <Button type="submit" className="mt-2 w-full" disabled={pending}>
          {pending ? "Entrando..." : "Entrar"}
        </Button>
      </form>
      <p className="mt-5 text-center text-sm text-slate-600">
        No tienes cuenta?{" "}
        <Link href="/register" className="font-semibold text-[var(--primary)] hover:text-[var(--primary-strong)]">
          Registrate
        </Link>
      </p>
    </Card>
  );
}
